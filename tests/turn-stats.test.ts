import { test, expect } from 'claude-code/testing'

import { countPatch, fileChange, formatCost, formatTokens } from '../hooks/turn-stats'

test('tokens shorten to k and M', async () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(1840)).toBe('1.8k')
  expect(formatTokens(48200)).toBe('48k')
  expect(formatTokens(-12300)).toBe('-12k')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})

test('cost keeps cents', async () => {
  expect(formatCost(0.004)).toBe('<$0.01')
  expect(formatCost(0.4213)).toBe('$0.42')
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
