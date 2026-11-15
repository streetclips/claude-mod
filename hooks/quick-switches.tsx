import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, TurnStepInput } from 'claude-code'

import { PALETTE } from './palette'

const MODELS = [
  { letter: 's', alias: 'sonnet', match: 'sonnet' },
  { letter: 'o', alias: 'opus', match: 'opus' },
  { letter: 'f', alias: 'fable', match: 'fable' },
]
const EFFORTS = [
  { short: 'l', level: 'low' },
  { short: 'm', level: 'medium' },
  { short: 'h', level: 'high' },
  { short: 'xh', level: 'xhigh' },
  { short: 'mx', level: 'max' },
]
const LEVELS: ReadonlySet<string> = new Set(EFFORTS.map(x => x.level))

const seen = atom({ plugin: 'alejandrocantero-claude-mod', key: 'seenEffort' } as const, {})
const tick = atom({ plugin: 'alejandrocantero-claude-mod', key: 'quickTick' } as const, 0)

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const modelKey = (model: string) => model.trim().toLowerCase().replace(/\[[^\]]*\]$/, '')

async function currentModel($: EngineInterface) {
  return modelKey(await $.session.model().catch(() => ''))
}

const isLevel = (value: unknown): value is string => typeof value === 'string' && LEVELS.has(value)

async function see($: EngineInterface, model: string, level: string | undefined) {
  if (!model) return
  const held = await read($, seen)
  if (held[model] === level) return
  const { [model]: _, ...others } = held
  await update($, seen, () => (level === undefined ? others : { ...others, [model]: level }))
}

type Settings = { effortLevel?: unknown; modelSettings?: Record<string, { effortLevel?: unknown } | undefined> }

async function settingsLevel($: EngineInterface, model: string) {
  const settings = (await $.settings.read().catch(() => ({}))) as Settings
  const own = Object.entries(settings.modelSettings ?? {}).find(([id]) => modelKey(id) === model)?.[1]?.effortLevel
  if (isLevel(own)) return own
  return isLevel(settings.effortLevel) ? settings.effortLevel : ''
}

async function run($: EngineInterface, command: string, args: string) {
  try {
    await $.command.run({ command, args })
  } catch (error) {
    $.ui.toast(`/${command} ${args}: ${message(error)}`)
  }
  await update($, tick, n => n + 1)
}

export async function noteStepEffort($: EngineInterface, e: TurnStepInput) {
  if (e.agentId === undefined && isLevel(e.effort)) await see($, modelKey(e.model), e.effort)
}

export const registerQuickSwitches: Register = on => {
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()
    await see($, await currentModel($), isLevel(level) ? level : undefined)
    await update($, tick, n => n + 1)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await see($, await currentModel($), undefined)
    await update($, tick, n => n + 1)
    return result
  }).catch(($, e, next) => next(e))
}

type Elements = { Box: any; Button: any; Text: any }

export async function renderQuickSwitches($: EngineInterface, { Box, Button, Text }: Elements): Promise<RenderNode> {
  await read($, tick)
  const held = await read($, seen)
  const model = await currentModel($)
  const level = held[model] ?? (await settingsLevel($, model))

  return (
    <Box flexDirection="row">
      {MODELS.map(m => (
        <Button key={`model-${m.letter}`} plain onPress={() => void run($, 'model', m.alias)}>
          <Text color={model.includes(m.match) ? PALETTE.green : PALETTE.comment}>{` ${m.letter}`}</Text>
        </Button>
      ))}
      <Text color={PALETTE.comment}> /</Text>
      {EFFORTS.map(x => (
        <Button
          key={`effort-${x.short}`}
          plain
          onPress={() => {
            void see($, model, x.level)
            void run($, 'effort', x.level)
          }}
        >
          <Text color={x.level === level ? PALETTE.green : PALETTE.comment}>{` ${x.short}`}</Text>
        </Button>
      ))}
      <Text color={PALETTE.comment}> /</Text>
    </Box>
  )
}
