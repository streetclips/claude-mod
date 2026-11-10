// The files and folders a reply names, resolved where the session runs.

import type { EngineInterface } from 'claude-code'

export type FileRef = { path: string; kind: 'file' | 'dir'; line?: string; column?: string }

// `path`, `path:line`, `path:3-13`, `path:line:column`, [label](path#Lline), [label](path#L3-L13)
const SPAN = /`([^`\n]+)`|\[[^\]\n]+\]\(([^)\s]+)\)/g
// a full stop closing the sentence after the path is not part of it
const FILE_REF = /^([^\s:#`]+?)(?::(\d+(?:-\d+)?)(?::(\d+))?|#L(\d+(?:-L?\d+)?))?(\.)?$/
// a name in running text: `markdown.tsx`, `hooks/markdown.tsx:12`, `a.ts:3-9`
export const PLAIN_REF = /(?<![\w./@-])((?:[\w@-]+\/)*[\w@-][\w.@-]*\.[A-Za-z][A-Za-z0-9]{1,4})(?::(\d+(?:-\d+)?)(?::(\d+))?)?(?![\w/])/g

// folders never walked for a name: too big, and never the file a reply means
const SKIP = new Set(['node_modules', 'vendor', '.git'])
const MAX_FILES = 20_000
const MAX_DEPTH = 12
const INDEX_TTL = 60_000

const found = new Map<string, Pick<FileRef, 'path' | 'kind'> | null>()

async function stat($: EngineInterface, cwd: string, path: string) {
  const id = `${cwd}\0${path}`
  if (!found.has(id)) {
    const s = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
    found.set(id, s?.realPath && (s.kind === 'file' || s.kind === 'dir') ? { path: s.realPath, kind: s.kind } : null)
  }
  return found.get(id) ?? null
}

export function fileUrl(path: string) {
  return `file://${encodeURI(path.replace(/\\/g, '/').replace(/^(?!\/)/, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}

// `~` and `~/x` mean the user's home, as a shell would read them
async function expand($: EngineInterface, path: string) {
  if (!/^~(?=[/\\]|$)/.test(path)) return path
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  return home ? home.replace(/[\\/]$/, '') + path.slice(1) : path
}

type Index = { at: number; names: Map<string, string[]> }
const indexes = new Map<string, Index>()

// a file the tools wrote changes what a name can mean: the next reply indexes again
export function forgetFiles() {
  indexes.clear()
}

const skipped = (path: string) => path.split('/').some(part => SKIP.has(part))

// git lists the workspace in one call, ignored files aside; outside a repository it answers nothing usable
async function gitFiles($: EngineInterface): Promise<string[] | null> {
  const run = await $.process.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { timeoutMs: 10_000 }).catch(() => undefined)
  if (!run || run.exitCode !== 0 || run.isStdoutTruncated) return null
  return run.stdout.split('\0').filter(path => path !== '' && !skipped(path)).slice(0, MAX_FILES)
}

// every file in the workspace by its path and by its name, kept for a minute
async function index($: EngineInterface, cwd: string) {
  const held = indexes.get(cwd)
  if (held && Date.now() - held.at < INDEX_TTL) return held
  const listed = await gitFiles($)
  if (listed) {
    const names = new Map<string, string[]>()
    for (const path of listed) {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const held = names.get(name)
      if (held) held.push(path)
      else names.set(name, [path])
    }
    const made = { at: Date.now(), names }
    indexes.set(cwd, made)
    return made
  }
  const names = new Map<string, string[]>()
  let files = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || files >= MAX_FILES) return
    const entries = await $.fs.list(dir || '.').catch(() => [])
    const below: string[] = []
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.kind === 'dir') {
        if (!SKIP.has(entry.name)) below.push(path)
      } else if (entry.kind === 'file' && files < MAX_FILES) {
        files++
        const held = names.get(entry.name)
        if (held) held.push(path)
        else names.set(entry.name, [path])
      }
    }
    await Promise.all(below.map(path => walk(path, depth + 1)))
  }
  await walk('', 0)
  const made = { at: Date.now(), names }
  indexes.set(cwd, made)
  return made
}

const depth = (path: string) => path.split('/').length

// a name given without enough of its path: the one file in the workspace it can only mean
async function infer($: EngineInterface, cwd: string, path: string) {
  const { names } = await index($, cwd)
  const candidates = names.get(path.slice(path.lastIndexOf('/') + 1)) ?? []
  const own = `${cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''}/`
  const matches = path.includes('/') ? candidates.filter(p => p.endsWith(`/${path}`) || own + p === path) : candidates
  if (!matches.length) return null
  const ranked = [...matches].sort((a, b) => depth(a) - depth(b) || a.length - b.length)
  const [first, second] = ranked
  // two files as near: no telling which one is meant
  if (!first || (second && depth(first) === depth(second))) return null
  return stat($, cwd, first)
}

// a name inside the workspace, never an absolute one, is the only thing inferred
const inferable = (path: string) => !/^[~/\\]|^[A-Za-z]:|^\.\.(\/|$)/.test(path)

async function direct($: EngineInterface, cwd: string, path: string) {
  const at = await stat($, cwd, await expand($, path))
  return at ? { at } : inferable(path) ? { infer: path } : {}
}

// the running text: no code spans, links or fenced blocks, where a name is already read
const prose = (text: string) => text
  .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, ' ')
  .replace(SPAN, ' ')

export async function fileRefs($: EngineInterface, text: string) {
  const cwd = await $.session.cwd()
  const spans = new Set<string>()
  for (const m of text.matchAll(SPAN)) {
    const span = m[1] ?? m[2] ?? ''
    if (/^[a-z][\w+.-]*:\/\//i.test(span)) continue
    const path = span.match(FILE_REF)?.[1]
    if (path && /[/.]/.test(path)) spans.add(span)
  }
  for (const m of prose(text).matchAll(PLAIN_REF)) spans.add(m[0])
  const refs: Record<string, FileRef> = {}
  // the paths are looked up first: only a name that is not there walks the workspace
  const looked = await Promise.all([...spans].map(async span => {
    const [, path = '', line, column, anchor] = span.match(FILE_REF) ?? []
    const found = path ? await direct($, cwd, path) : {}
    return { span, line, column, anchor, found }
  }))
  await Promise.all(looked.map(async ({ span, line, column, anchor, found }) => {
    const at = 'at' in found ? found.at : 'infer' in found ? await infer($, cwd, found.infer) : null
    // the editor takes one line: a range opens at its first line
    if (at) refs[span] = { ...at, line: (line ?? anchor)?.split('-')[0], column }
  }))
  return refs
}
