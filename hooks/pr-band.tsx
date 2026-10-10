import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PullRequest } from '../types'
import { DRACULA } from './palette'

const pr = atom({ plugin: 'clps-claude-code-mod', key: 'pr' } as const, null)

async function refresh($: EngineInterface) {
  const found = await $.process
    .run(['gh', 'pr', 'view', '--json', 'number,title,author,state'], { timeoutMs: 10000 })
    .then(({ exitCode, stdout }): PullRequest | null => {
      if (exitCode !== 0) return null
      const { number, title, author, state } = JSON.parse(stdout)
      return { number, title, author: author.login, state }
    })
    .catch(() => null)
  if (JSON.stringify(await read($, pr)) === JSON.stringify(found)) return
  await update($, pr, () => found)
}

export const registerPrBand: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, pr)
    if (e.props.hasSurvey || current === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Box flexShrink={0}><Text color={DRACULA.purple}>{`#${current.number} `}</Text></Box>
        <Box flexShrink={1}><Text color={DRACULA.foreground} wrap="truncate-end">{current.title}</Text></Box>
        <Box flexShrink={0}><Text color={DRACULA.comment}>{` · @${current.author}`}</Text></Box>
        {current.state !== 'OPEN' && <Box flexShrink={0}><Text color={DRACULA.orange}>{` · ${current.state.toLowerCase()}`}</Text></Box>}
      </Box>
    )
  })
}
