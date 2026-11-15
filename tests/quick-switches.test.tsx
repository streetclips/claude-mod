import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const GREEN = '#50fa7b'
const SHORTS = ['l', 'm', 'h', 'xh', 'mx']
const IDS: Record<string, string> = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-2' }
const SETTINGS = {
  effortLevel: 'medium',
  modelSettings: {
    'claude-opus-5-5': { effortLevel: 'xhigh' },
    'claude-sonnet-5-5': { effortLevel: 'low' },
  },
}

function world (on: On, { model = 'claude-opus-5-5', settings = SETTINGS as object } = {}) {
  let current = model
  const ran: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('store.get', () => ({ value: undefined }))
  on('session.model', () => ({ value: current }))
  on('settings.read', () => ({ value: settings }) as never)
  on('command.run', ($, e) => {
    ran.push(`/${e.command} ${e.args}`.trim())
    if (e.command === 'model' && e.args) current = IDS[e.args] ?? e.args
    return { text: '' }
  })
  on('turn.step', async function * ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  return { ran }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
const footer = ($: Engine) =>
  $.ui.mount({ plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
const typed = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

async function step ($: Engine, { model = 'claude-opus-5-5', effort, agentId }: { model?: string; effort: string; agentId?: string }) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1, agentId } as never)
  for await (const _ of stream) void _
}

async function lit (ui: Awaited<ReturnType<typeof footer>>) {
  const shorts: string[] = []
  for (const short of SHORTS) {
    if ((await ui.find({ type: 'Text', text: ` ${short}` }))?.props.color === GREEN) shorts.push(short)
  }
  return shorts
}

test('before any click or turn, the effort lit is the one the settings give the model in use', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await footer($)
  expect(await lit(ui)).toEqual(['xh'])
})

test('a model the settings name no effort for falls back to the effort set for all', async ($, on) => {
  world(on, { model: 'claude-fable-5-2' })
  await startSession($)
  const ui = await footer($)
  expect(await lit(ui)).toEqual(['m'])
})

test('nothing is lit where the settings set no effort and no turn has run', async ($, on) => {
  world(on, { settings: {} })
  await startSession($)
  const ui = await footer($)
  expect(await lit(ui)).toEqual([])
})

test('switching model with its button lights the effort that model runs at', async ($, on) => {
  const w = world(on)
  await startSession($)
  const ui = await footer($)
  await ui.press({ key: 'model-s' })
  expect(w.ran).toEqual(['/model sonnet'])
  expect(await lit(ui)).toEqual(['l'])
  await ui.press({ key: 'model-o' })
  expect(await lit(ui)).toEqual(['xh'])
})

test('a level button runs /effort and lights at once', async ($, on) => {
  const w = world(on)
  await startSession($)
  const ui = await footer($)
  await ui.press({ key: 'effort-h' })
  expect(w.ran).toEqual(['/effort high'])
  expect(await lit(ui)).toEqual(['h'])
})

test('the level a request of the main loop runs at wins over the settings; a subagent request does not count', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await footer($)
  await step($, { effort: 'low', agentId: 'agent-1' })
  expect(await lit(ui)).toEqual(['xh'])
  await step($, { effort: 'max' })
  expect(await lit(ui)).toEqual(['mx'])
})

test('a typed /effort with a level lights it; without one the settings answer again', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await footer($)
  await typed($, 'effort', 'High')
  expect(await lit(ui)).toEqual(['h'])
  await typed($, 'effort')
  expect(await lit(ui)).toEqual(['xh'])
})

test('a typed /model drops the level seen for the model it lands on, which its picker may have changed', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await footer($)
  await ui.press({ key: 'effort-mx' })
  expect(await lit(ui)).toEqual(['mx'])
  await typed($, 'model', 'opus')
  expect(await lit(ui)).toEqual(['xh'])
})
