// The files and folders a reply names, resolved where the session runs.

import type { EngineInterface } from 'claude-code'

export type FileRef = { path: string; kind: 'file' | 'dir'; line?: string; column?: string }

// `path`, `path:line`, `path:line:column`, [label](path#Lline)
const SPAN = /`([^`\n]+)`|\[[^\]\n]+\]\(([^)\s]+)\)/g
const FILE_REF = /^([^\s:#`]+?)(?::(\d+)(?::(\d+))?|#L(\d+))?$/

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

export async function fileRefs($: EngineInterface, text: string) {
  const cwd = await $.session.cwd()
  const spans = new Set<string>()
  for (const m of text.matchAll(SPAN)) {
    const span = m[1] ?? m[2] ?? ''
    if (/^[a-z][\w+.-]*:\/\//i.test(span)) continue
    const path = span.match(FILE_REF)?.[1]
    if (path && /[/.]/.test(path)) spans.add(span)
  }
  const refs: Record<string, FileRef> = {}
  await Promise.all([...spans].map(async span => {
    const [, path = '', line, column, anchor] = span.match(FILE_REF) ?? []
    const at = await stat($, cwd, path)
    if (at) refs[span] = { ...at, line: line ?? anchor, column }
  }))
  return refs
}
