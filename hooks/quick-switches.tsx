import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderNode } from 'claude-code'

import { PALETTE } from './palette'

const MODELS = [
  { letter: 'o', alias: 'opus', match: 'opus' },
  { letter: 's', alias: 'sonnet', match: 'sonnet' },
  { letter: 'f', alias: 'fable', match: 'fable' },
]
const EFFORTS = [
  { short: 'l', level: 'low' },
  { short: 'm', level: 'medium' },
  { short: 'h', level: 'high' },
  { short: 'xh', level: 'xhigh' },
  { short: 'mx', level: 'max' },
]
const EFFORT_KEY = 'quickEffort'

const effort = atom({ plugin: 'alejandrocantero-claude-mod', key: 'quickEffort' } as const, '')
const tick = atom({ plugin: 'alejandrocantero-claude-mod', key: 'quickTick' } as const, 0)

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function run($: EngineInterface, command: string, args: string) {
  try {
    await $.command.run({ command, args })
  } catch (error) {
    $.ui.toast(`/${command} ${args}: ${message(error)}`)
  }
  await update($, tick, n => n + 1)
}

export async function restoreQuickSwitches($: EngineInterface) {
  const saved = await $.store.get(EFFORT_KEY)
  if (typeof saved === 'string') await update($, effort, () => saved)
}

type Elements = { Box: any; Button: any; Text: any }

export async function renderQuickSwitches($: EngineInterface, { Box, Button, Text }: Elements): Promise<RenderNode> {
  await read($, tick)
  const level = await read($, effort)
  const model = (await $.session.model().catch(() => '')).toLowerCase()

  return (
    <Box flexDirection="row">
      {MODELS.map(m => (
        <Button key={`model-${m.letter}`} plain onPress={() => void run($, 'model', m.alias)}>
          <Text color={model.includes(m.match) ? PALETTE.green : PALETTE.comment}>{` ${m.letter}`}</Text>
        </Button>
      ))}
      <Text color={PALETTE.comment}> ·</Text>
      {EFFORTS.map(x => (
        <Button
          key={`effort-${x.short}`}
          plain
          onPress={() => {
            void update($, effort, () => x.level)
            void $.store.set(EFFORT_KEY, x.level)
            void run($, 'effort', x.level)
          }}
        >
          <Text color={x.level === level ? PALETTE.green : PALETTE.comment}>{` ${x.short}`}</Text>
        </Button>
      ))}
    </Box>
  )
}
