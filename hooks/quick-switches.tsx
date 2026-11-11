import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderNode } from 'claude-code'

import { PALETTE } from './palette'

const MODELS = [
  { letter: 'o', alias: 'opus', match: 'opus' },
  { letter: 's', alias: 'sonnet', match: 'sonnet' },
  { letter: 'h', alias: 'haiku', match: 'haiku' },
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

  const family = MODELS.findIndex(m => model.includes(m.match))
  const letter = family >= 0 ? MODELS[family]!.letter : '?'
  const step = EFFORTS.findIndex(x => x.level === level)
  const short = step >= 0 ? EFFORTS[step]!.short : '·'

  const nextModel = MODELS[(family + 1) % MODELS.length]!
  const nextEffort = EFFORTS[(step + 1) % EFFORTS.length]!

  return (
    <Box flexDirection="row">
      <Button key="model" plain onPress={() => void run($, 'model', nextModel.alias)}>
        <Text color={PALETTE.green}>{letter}</Text>
      </Button>
      <Text color={PALETTE.comment}> </Text>
      <Button
        key="effort"
        plain
        onPress={() => {
          void update($, effort, () => nextEffort.level)
          void $.store.set(EFFORT_KEY, nextEffort.level)
          void run($, 'effort', nextEffort.level)
        }}
      >
        <Text color={PALETTE.green}>{short}</Text>
      </Button>
    </Box>
  )
}
