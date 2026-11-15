import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PING } from '../hooks/keep-warm'

const MINUTE = 60_000
const PREFIX = 180_000

type Reply = 'warm' | 'cold' | 'nothing' | 'error'
type Fork = { prompt: string; effort?: string; at: number }

function world(on: On, replies: Reply[] = []) {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  mock.env(on, {})
  const forks: Fork[] = []
  const lines: { text: string; to?: string }[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('ui.log', ($, e) => {
    lines.push({ text: e.text, to: e.to })
    return { value: undefined }
  })
  on('model.fork', ($, e) => {
    forks.push({ prompt: e.prompt, effort: e.effort, at: clock.now() })
    const reply = replies.shift() ?? 'warm'
    const usage = {
      input_tokens: 40,
      output_tokens: 2,
      cache_read_input_tokens: reply === 'cold' ? 0 : PREFIX,
      cache_creation_input_tokens: reply === 'cold' ? PREFIX : 0,
    }
    if (reply === 'nothing') return { value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }
    if (reply === 'error') return { value: { isAnswered: false as const, reason: 'api-error' as const, status: 529, error: 'overloaded' as never, usage } }
    return { value: { isAnswered: true as const, text: 'ok', usage } }
  })
  const shown = () => lines.filter(line => line.to !== 'debug').map(line => line.text)
  return { clock, forks, shown }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

async function turn($: Engine, { agentId, sendAt }: { agentId?: string; sendAt?: () => Promise<void> } = {}) {
  await $.turn.start({ text: 'hi', turnId: 't1', agentId })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId } as never)) void _
  await sendAt?.()
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId })
}

test('off by default: a pause never pings', async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($)
  await w.clock.advance(5 * 60 * MINUTE)
  expect(w.forks).toEqual([])
})

test('1h: pings 55 minutes after the last request, then every 55 minutes up to the cap', { options: { keepWarm: '1h', keepWarmPings: 3 } }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($)
  await w.clock.advance(54 * MINUTE)
  expect(w.forks).toEqual([])
  await w.clock.advance(MINUTE)
  expect(w.forks).toEqual([{ prompt: PING, effort: undefined, at: 55 * MINUTE }])
  await w.clock.advance(5 * 60 * MINUTE)
  expect(w.forks.map(fork => fork.at)).toEqual([55, 110, 165].map(minutes => minutes * MINUTE))
  expect(w.shown()).toEqual([
    'Prompt cache kept warm: 180k tokens read (ping 1 of 3).',
    'Prompt cache kept warm: 180k tokens read (ping 2 of 3).',
    expect.stringMatching(/^Prompt cache kept warm: 180k tokens read \(ping 3 of 3, the last: it goes cold at \d\d:\d\d\)\.$/),
  ])
})

test('5m: pings 4 minutes after the request was sent, not after the turn ended', { options: { keepWarm: '5m' } }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($, { sendAt: () => w.clock.advance(90_000) })
  await w.clock.advance(150_000 - 1)
  expect(w.forks).toEqual([])
  await w.clock.advance(1)
  expect(w.forks.map(fork => fork.at)).toEqual([4 * MINUTE])
  await w.clock.advance(60 * MINUTE)
  expect(w.forks.map(fork => fork.at)).toEqual([4, 8, 12, 16].map(minutes => minutes * MINUTE))
})

test('a prompt during the pause cancels the ping and starts the count again', { options: { keepWarm: '1h', keepWarmPings: 2 } }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($)
  await w.clock.advance(60 * MINUTE)
  expect(w.forks).toHaveLength(1)
  await turn($)
  await w.clock.advance(54 * MINUTE)
  expect(w.forks).toHaveLength(1)
  await w.clock.advance(3 * 60 * MINUTE)
  expect(w.forks).toHaveLength(3)
  expect(w.shown().at(-1)).toMatch(/ping 2 of 2, the last/)
})

test('a turn that starts before the ping is due cancels it', { options: { keepWarm: '1h' } }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($)
  await w.clock.advance(30 * MINUTE)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await w.clock.advance(3 * 60 * MINUTE)
  expect(w.forks).toEqual([])
})

test('a subagent turn neither arms nor cancels the main thread ping', { options: { keepWarm: '1h' } }, async ($, on) => {
  const w = world(on)
  await startSession($)
  await turn($)
  await w.clock.advance(30 * MINUTE)
  await turn($, { agentId: 'a1' })
  await w.clock.advance(25 * MINUTE)
  expect(w.forks.map(fork => fork.at)).toEqual([55 * MINUTE])
})

test('a cache that had already gone cold stops the pings and says so', { options: { keepWarm: '1h' } }, async ($, on) => {
  const w = world(on, ['cold'])
  await startSession($)
  await turn($)
  await w.clock.advance(5 * 60 * MINUTE)
  expect(w.forks).toHaveLength(1)
  expect(w.shown()).toEqual([expect.stringMatching(/already gone cold, so the ping wrote 180k tokens again/)])
})

test('an API error stops the pings and says so; nothing to fork stops them quietly', { options: { keepWarm: '5m' } }, async ($, on) => {
  const w = world(on, ['error', 'nothing'])
  await startSession($)
  await turn($)
  await w.clock.advance(60 * MINUTE)
  expect(w.forks).toHaveLength(1)
  expect(w.shown()).toEqual(['Keep-warm ping failed (API error 529); pings resume after your next prompt.'])
  await turn($)
  await w.clock.advance(60 * MINUTE)
  expect(w.forks).toHaveLength(2)
  expect(w.shown()).toHaveLength(1)
})
