import type { EngineInterface, ModelForkResult, PluginOptions, Timer, TurnCompleteInput, TurnStartInput, TurnStepInput } from 'claude-code'

import { formatClock, formatTokens } from './turn-stats'

type Ttl = '1h' | '5m'

const MINUTE = 60_000
const TTL_MS: Record<Ttl, number> = { '1h': 60 * MINUTE, '5m': 5 * MINUTE }
const MARGIN_MS: Record<Ttl, number> = { '1h': 5 * MINUTE, '5m': MINUTE }
const MAX_PINGS = 24
export const PING = 'Prompt cache keep-alive ping. You have no tools here. Reply with only "ok", straight away, without thinking it over.'

let ttl: Ttl | undefined
let maxPings = 4
let timer: Timer | undefined
let sentAt = 0
let pings = 0
let epoch = 0
let isPinging = false

const isTtl = (value: unknown): value is Ttl => value === '1h' || value === '5m'

function cancel() {
  timer?.cancel()
  timer = undefined
}

async function arm($: EngineInterface) {
  cancel()
  if (!ttl) return
  const due = sentAt + TTL_MS[ttl] - MARGIN_MS[ttl]
  const armedFor = epoch
  timer = $.clock.after(Math.max(0, due - (await $.clock.now())), () => {
    timer = undefined
    if (armedFor === epoch) void ping($, armedFor).catch(() => undefined)
  })
}

async function ping($: EngineInterface, armedFor: number) {
  if (!ttl) return
  const startedAt = await $.clock.now()
  if (startedAt - sentAt >= TTL_MS[ttl]) {
    $.ui.log('keep-warm: the timer fired after the cache expired; no ping', { to: 'debug' })
    return
  }
  isPinging = true
  let reply: ModelForkResult
  try {
    reply = await $.model.fork({ prompt: PING })
  } catch (error) {
    $.ui.log(`keep-warm: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
    return
  } finally {
    isPinging = false
  }
  if (armedFor !== epoch) return
  if (!('usage' in reply)) {
    $.ui.log('keep-warm: nothing to fork; no ping', { to: 'debug' })
    return
  }
  if (!reply.isAnswered && reply.reason === 'api-error') {
    $.ui.log(`Keep-warm ping failed (API error ${reply.status ?? reply.error}); pings resume after your next prompt.`)
    return
  }
  const read = reply.usage.cache_read_input_tokens
  const written = reply.usage.cache_creation_input_tokens
  if (written > read) {
    $.ui.log(`Keep-warm: the prompt cache had already gone cold, so the ping wrote ${formatTokens(written)} tokens again. Pings stop until your next prompt; check the TTL picked in /config.`)
    return
  }
  pings++
  sentAt = startedAt
  if (pings < maxPings) {
    $.ui.log(`Prompt cache kept warm: ${formatTokens(read)} tokens read (ping ${pings} of ${maxPings}).`)
    await arm($)
  } else {
    $.ui.log(`Prompt cache kept warm: ${formatTokens(read)} tokens read (ping ${pings} of ${maxPings}, the last: it goes cold at ${formatClock(startedAt + TTL_MS[ttl])}).`)
  }
}

export function configureKeepWarm(options: PluginOptions) {
  ttl = isTtl(options.keepWarm) ? options.keepWarm : undefined
  const asked = Math.floor(Number(options.keepWarmPings))
  maxPings = Number.isFinite(asked) ? Math.min(MAX_PINGS, Math.max(1, asked)) : 4
}

export function keepWarmTurnStart(e: TurnStartInput) {
  if (e.agentId !== undefined) return
  epoch++
  cancel()
}

export async function keepWarmRequest($: EngineInterface, e: TurnStepInput) {
  if (ttl && e.agentId === undefined) sentAt = await $.clock.now()
}

export async function keepWarmTurnComplete($: EngineInterface, e: TurnCompleteInput) {
  if (!ttl || e.agentId !== undefined || isPinging) return
  epoch++
  pings = 0
  await arm($)
}
