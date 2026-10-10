import { test, expect } from 'claude-code/testing'

const ENGINE = { type: 'Text', children: ['ENGINE'] } as any

test('successful Bash call draws one compact line', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, () => ENGINE)
  const tree = await $.ui.render({
    surface: 'terminal', component: 'ToolUse', requestId: 't1',
    props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'git status\ngit log' }, isRunning: false, isErrored: false, isInterrupted: false },
  } as any)
  const json = JSON.stringify(tree)
  expect(json).toContain('git status')
  expect(json).not.toContain('git log')
  expect(json).toContain('✓')
  expect(json).not.toContain('ENGINE')
})

test('failed Bash call keeps the engine row and result', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, () => ENGINE)
  on('ui.render', { component: 'ToolResult' }, () => ENGINE)
  const use = await $.ui.render({
    surface: 'terminal', component: 'ToolUse', requestId: 't2',
    props: { tool_use_id: 't2', tool: 'Bash', input: { command: 'false' }, isRunning: false, isErrored: true, isInterrupted: false },
  } as any)
  const result = await $.ui.render({
    surface: 'terminal', component: 'ToolResult', requestId: 't2',
    props: { tool_use_id: 't2', tool: 'Bash', output: 'boom', isErrored: true },
  } as any)
  expect(JSON.stringify(use)).toContain('ENGINE')
  expect(JSON.stringify(result)).toContain('ENGINE')
})

test('Edit keeps the engine row', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, () => ENGINE)
  const tree = await $.ui.render({
    surface: 'terminal', component: 'ToolUse', requestId: 't3',
    props: { tool_use_id: 't3', tool: 'Edit', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
  } as any)
  expect(JSON.stringify(tree)).toContain('ENGINE')
})

test('turn duration draws minutes and seconds', async ($, on) => {
  const tree = await $.ui.render({
    surface: 'terminal', component: 'TurnDuration', requestId: 'd1',
    props: { word: 'Baked', durationMs: 64000 },
  } as any)
  expect(JSON.stringify(tree)).toContain('1m 4s')
})
