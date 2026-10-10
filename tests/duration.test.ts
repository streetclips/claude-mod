import { test, expect } from 'claude-code/testing'

test('turn duration draws minutes and seconds', async ($, on) => {
  const tree = await $.ui.render({
    surface: 'terminal', component: 'TurnDuration', requestId: 'd1',
    props: { word: 'Baked', durationMs: 64000 },
  } as any)
  expect(JSON.stringify(tree)).toContain('1m 4s')
})
