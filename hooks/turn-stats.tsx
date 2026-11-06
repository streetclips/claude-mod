import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallInput, ToolCallResult, TurnCompleteInput } from 'claude-code'

import type { FileChange, TurnStats } from '../types'
import { PALETTE } from './palette'

const KEEP = 200

const turns = atom({ plugin: 'alejandrocantero-claude-mod', key: 'turns' } as const, {})

type Running = {
  contextTokens: number | null
  tools: number
  files: Record<string, FileChange>
}

let running: Running | null = null

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function formatTokens(n: number) {
  const abs = Math.abs(n)
  const short = (value: number, unit: string) => `${value.toFixed(Math.abs(value) < 10 ? 1 : 0).replace(/\.0$/, '')}${unit}`
  if (abs < 1000) return `${n}`
  if (abs < 1_000_000) return short(n / 1000, 'k')
  return short(n / 1_000_000, 'M')
}

export function formatClock(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function countPatch(patch: readonly { lines: readonly string[] }[]) {
  let added = 0
  let removed = 0
  for (const hunk of patch) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }
  return { added, removed }
}

function countLines(text: string) {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function fileChange(tool: string, result: unknown): { path: string; added: number; removed: number } | null {
  const r = result as any
  if (!r || r.staged) return null
  if (tool === 'Edit') return { path: r.filePath, ...countPatch(r.structuredPatch ?? []) }
  if (tool === 'Write') {
    const patch = r.structuredPatch ?? []
    if (r.type === 'create' && patch.length === 0) return { path: r.filePath, added: countLines(r.content), removed: 0 }
    return { path: r.filePath, ...countPatch(patch) }
  }
  if (tool === 'NotebookEdit' && !r.error) return { path: r.notebook_path, added: 0, removed: 0 }
  return null
}

async function measure($: EngineInterface) {
  const usage = await $.session.usage().catch(() => null)
  return { contextTokens: usage?.context.tokens ?? null }
}

const delta = (end: number | null, start: number | null) => (end === null || start === null ? null : end - start)

export function renderStats(stats: TurnStats, Text: any) {
  const sep = <Text color={PALETTE.comment}> · </Text>
  const files = Object.keys(stats.files).length
  let added = 0
  let removed = 0
  for (const change of Object.values(stats.files)) {
    added += change.added
    removed += change.removed
  }
  return [
    sep,
    <Text color={PALETTE.comment}>↑{formatTokens(stats.inputTokens)} ↓{formatTokens(stats.outputTokens)}</Text>,
    ...(stats.contextDelta === null
      ? []
      : [sep, <Text color={PALETTE.comment}>ctx {stats.contextDelta >= 0 ? '+' : ''}{formatTokens(stats.contextDelta)}</Text>]),
    sep,
    <Text color={PALETTE.comment}>{stats.tools} {stats.tools === 1 ? 'tool' : 'tools'}</Text>,
    ...(files === 0
      ? []
      : [
          sep,
          <Text color={PALETTE.comment}>{files} {files === 1 ? 'file' : 'files'} </Text>,
          <Text color={PALETTE.green}>+{added}</Text>,
          <Text color={PALETTE.comment}> </Text>,
          <Text color={PALETTE.red}>-{removed}</Text>,
        ]),
  ]
}

async function recordTurn($: EngineInterface, e: TurnCompleteInput) {
  if (e.agentId || !running) return
  const start = running
  running = null
  const end = await measure($)
  const u = e.usage
  const stats: TurnStats = {
    inputTokens: u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0,
    outputTokens: u?.output_tokens ?? 0,
    endedAt: Date.now(),
    contextDelta: delta(end.contextTokens, start.contextTokens),
    tools: start.tools,
    files: start.files,
  }
  await update($, turns, held => {
    const kept = Object.entries(held).slice(-(KEEP - 1))
    return { ...Object.fromEntries(kept), [`${e.durationMs}`]: stats }
  })
}

export async function startTurnStats($: EngineInterface) {
  running = { ...(await measure($)), tools: 0, files: {} }
}

export function countTool(e: ToolCallInput, result: ToolCallResult) {
  if (!running || e.agentId || 'deny' in result) return
  running.tools++
  if (result.isError) return
  const change = fileChange(e.tool, result.result)
  if (change?.path) {
    const held = running.files[change.path] ?? { added: 0, removed: 0 }
    running.files[change.path] = { added: held.added + change.added, removed: held.removed + change.removed }
  }
}

export const registerTurnStats: Register = on => {
  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    await recordTurn($, e)
    return next(e)
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const stats = (await read($, turns))[`${e.props.durationMs}`]
    const clock = stats?.endedAt ? `⏱ ${formatClock(stats.endedAt)} · ` : '⏱ '
    return (
      <Box marginTop={1}>
        <Text color={PALETTE.comment}>{clock}{formatDuration(e.props.durationMs)}</Text>
        {stats ? renderStats(stats, Text) : null}
      </Box>
    )
  })
}
