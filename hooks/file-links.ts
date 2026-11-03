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

type Index = { at: number; paths: string[]; names: Map<string, string[]> }
const indexes = new Map<string, Index>()

// every file in the workspace by its path and by its name, kept for a minute
async function index($: EngineInterface, cwd: string) {
  const held = indexes.get(cwd)
  if (held && Date.now() - held.at < INDEX_TTL) return held
  const paths: string[] = []
  const names = new Map<string, string[]>()
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || paths.length >= MAX_FILES) return
    const entries = await $.fs.list(dir || '.').catch(() => [])
    const below: string[] = []
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.kind === 'dir') {
        if (!SKIP.has(entry.name)) below.push(path)
      } else if (entry.kind === 'file' && paths.length < MAX_FILES) {
        paths.push(path)
        const held = names.get(entry.name)
        if (held) held.push(path)
        else names.set(entry.name, [path])
      }
    }
    await Promise.all(below.map(path => walk(path, depth + 1)))
  }
  await walk('', 0)
  const made = { at: Date.now(), paths, names }
  indexes.set(cwd, made)
  return made
}

const depth = (path: string) => path.split('/').length

// a name given without enough of its path: the one file in the workspace it can only mean
async function infer($: EngineInterface, cwd: string, path: string) {
  const { paths, names } = await index($, cwd)
  const matches = path.includes('/') ? paths.filter(p => p.endsWith(`/${path}`)) : names.get(path) ?? []
  if (!matches.length) return null
  const ranked = [...matches].sort((a, b) => depth(a) - depth(b) || a.length - b.length)
  const [first, second] = ranked
  // two files as near: no telling which one is meant
  if (!first || (second && depth(first) === depth(second))) return null
  return stat($, cwd, first)
}

async function locate($: EngineInterface, cwd: string, path: string) {
  const direct = await stat($, cwd, await expand($, path))
  if (direct) return direct
  // only a name inside the workspace is inferred, never an absolute one
  if (/^[~/\\]|^[A-Za-z]:|^\.\.(\/|$)/.test(path)) return null
  return infer($, cwd, path)
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
  await Promise.all([...spans].map(async span => {
    const [, path = '', line, column, anchor] = span.match(FILE_REF) ?? []
    const at = await locate($, cwd, path)
    // ttt takes one line: a range opens at its first line
    if (at) refs[span] = { ...at, line: (line ?? anchor)?.split('-')[0], column }
  }))
  return refs
}
