import type { EngineInterface, Register, SessionRateLimit, TurnUsage } from 'claude-code'

import { formatCost, formatTokens } from './turn-stats'

const FAMILIES: Record<string, string> = { opus: 'o', sonnet: 's', haiku: 'h', fable: 'f' }

export type StatusFigures = {
  dir: string
  branch: string | null
  model: string
  tokens: number | null
  cachePercent: number | null
  tokensPerSecond: number | null
  costUsd: number | null
  limits: readonly SessionRateLimit[]
}

export type TurnRates = {
  cachePercent: number | null
  tokensPerSecond: number | null
}

let lastRates: TurnRates = { cachePercent: null, tokensPerSecond: null }
let lastModel: string | null = null

export function shorten(name: string) {
  return name.length > 10 ? `${name.slice(0, 4)}**${name.slice(-4)}` : name
}

export function modelTag(model: string) {
  const lower = model.toLowerCase()
  for (const [family, tag] of Object.entries(FAMILIES)) if (lower.includes(family)) return tag
  const bare = (lower.split('/').pop() ?? lower).replace(/\[[^\]]*\]$/, '')
  return shorten(bare.split(/[-.]/)[0] || bare)
}

export function clockTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function turnRates(usage: TurnUsage | undefined, durationMs: number): TurnRates {
  if (!usage) return { cachePercent: null, tokensPerSecond: null }
  const total = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const seconds = durationMs / 1000
  return {
    cachePercent: total > 0 ? Math.floor((usage.cache_read_input_tokens * 100) / total) : null,
    tokensPerSecond: seconds > 0 && usage.output_tokens > 0 ? Math.floor(usage.output_tokens / seconds) : null,
  }
}

const percentOf = (limit: SessionRateLimit | undefined) => (limit ? `${Math.floor(limit.percentUsed)}` : '--')

export function renderStatus(figures: StatusFigures) {
  const parts = [shorten(figures.dir)]
  if (figures.branch) parts.push(shorten(figures.branch))
  parts.push(modelTag(figures.model))
  if (figures.tokens) parts.push(formatTokens(figures.tokens))
  if (figures.cachePercent !== null) parts.push(`${figures.cachePercent}%`)
  if (figures.tokensPerSecond !== null) parts.push(`${figures.tokensPerSecond}t/s`)
  if (figures.costUsd !== null) parts.push(formatCost(figures.costUsd))
  const five = figures.limits.find(limit => limit.kind === 'five_hour')
  const seven = figures.limits.find(limit => limit.kind === 'seven_day')
  if (five || seven) {
    const reset = five?.resetsAt ? clockTime(five.resetsAt) : null
    parts.push(`${percentOf(five)}|${percentOf(seven)}${reset ? ` ↻${reset}` : ''}`)
  }
  return parts.join(' ')
}

async function branchOf($: EngineInterface) {
  const run = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 2000 }).catch(() => null)
  if (!run || run.exitCode !== 0) return null
  return run.stdout.trim() || null
}

async function paint($: EngineInterface) {
  const [cwd, model, usage, branch] = await Promise.all([
    $.session.cwd(),
    $.session.model(),
    $.session.usage().catch(() => null),
    branchOf($),
  ])
  const figures: StatusFigures = {
    dir: cwd.split('/').filter(Boolean).pop() ?? cwd,
    branch,
    model: lastModel ?? model,
    tokens: usage?.context.tokens ?? null,
    cachePercent: lastRates.cachePercent,
    tokensPerSecond: lastRates.tokensPerSecond,
    costUsd: usage?.cost?.usd ?? null,
    limits: usage?.rateLimits ?? [],
  }
  $.ui.status(renderStatus(figures))
}

export const registerStatusLine: Register = on => {
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    lastModel = null
    await paint($).catch(() => {})
    return next(e)
  })

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    if (e.agentId === undefined) {
      lastRates = turnRates(e.usage, e.durationMs)
      lastModel = e.usage?.model ?? lastModel
      await paint($).catch(() => {})
    }
    return next(e)
  })
}
