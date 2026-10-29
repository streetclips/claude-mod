import { test, expect } from 'claude-code/testing'

import { countPatch, fileChange, formatClock, formatTokens } from '../hooks/turn-stats'

test('tokens shorten to k and M', async () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(1840)).toBe('1.8k')
  expect(formatTokens(48200)).toBe('48k')
  expect(formatTokens(-12300)).toBe('-12k')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})

test('clock shows local HH:MM', async () => {
  expect(formatClock(new Date(2026, 0, 2, 9, 5).getTime())).toBe('09:05')
  expect(formatClock(new Date(2026, 0, 2, 23, 59).getTime())).toBe('23:59')
})

test('patch counts added and removed lines', async () => {
  expect(countPatch([{ lines: [' a', '-b', '+c', '+d'] }, { lines: ['-e'] }])).toEqual({ added: 2, removed: 2 })
})

test('edit and write results become file changes', async () => {
  expect(fileChange('Edit', { filePath: '/a.ts', structuredPatch: [{ lines: ['-x', '+y', '+z'] }] }))
    .toEqual({ path: '/a.ts', added: 2, removed: 1 })
  expect(fileChange('Write', { type: 'create', filePath: '/b.ts', content: 'one\ntwo\n', structuredPatch: [] }))
    .toEqual({ path: '/b.ts', added: 2, removed: 0 })
  expect(fileChange('Edit', { filePath: '/c.ts', structuredPatch: [], staged: true })).toBe(null)
  expect(fileChange('Read', { filePath: '/d.ts' })).toBe(null)
})
