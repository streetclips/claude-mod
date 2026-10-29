import { test, expect } from 'claude-code/testing'

import { clockTime, modelTag, renderStatus, shorten, turnRates } from '../hooks/status-line'

test('long names keep their edges', async () => {
  expect(shorten('console-powers')).toBe('cons**wers')
  expect(shorten('next')).toBe('next')
})

test('model families collapse to a letter, others to their name', async () => {
  expect(modelTag('claude-opus-5-5')).toBe('o')
  expect(modelTag('claude-sonnet-5-5')).toBe('s')
  expect(modelTag('deepseek/deepseek-v4.1-flash-1017')).toBe('deepseek')
  expect(modelTag('openai/gpt-5.5-20260101')).toBe('gpt')
  expect(modelTag('@preset/coding[1m]')).toBe('coding')
})

test('a turn reports its cache hit rate and throughput', async () => {
  expect(turnRates({ model: 'm', input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 200 }, 4000))
    .toEqual({ cachePercent: 90, tokensPerSecond: 50 })
  expect(turnRates(undefined, 4000)).toEqual({ cachePercent: null, tokensPerSecond: null })
  expect(turnRates({ model: 'm', input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 }, 0))
    .toEqual({ cachePercent: null, tokensPerSecond: null })
})

test('reset times print as a local clock', async () => {
  const iso = new Date(2026, 9, 29, 18, 40).toISOString()
  expect(clockTime(iso)).toBe('18:40')
  expect(clockTime('not a date')).toBe(null)
})

test('the line joins dir, branch, model, figures and limits', async () => {
  expect(
    renderStatus({
      dir: 'console-powers',
      branch: 'main',
      model: 'claude-opus-5-5',
      tokens: 120000,
      cachePercent: 92,
      tokensPerSecond: 45,
      costUsd: 1.234,
      limits: [
        { kind: 'five_hour', percentUsed: 23.5, resetsAt: new Date(2026, 9, 29, 18, 40).toISOString() },
        { kind: 'seven_day', percentUsed: 85 },
      ],
    }),
  ).toBe('cons**wers main o 120k 92% 45t/s $1.23 23|85 ↻18:40')
})

test('figures the engine lacks are left out', async () => {
  expect(renderStatus({ dir: 'next', branch: null, model: 'claude-haiku-5-5', tokens: null, cachePercent: null, tokensPerSecond: null, costUsd: null, limits: [] }))
    .toBe('next h')
})
