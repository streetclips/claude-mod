import type { Register } from 'claude-code'

import { renderMarkdown } from './markdown'
import { noteTool, noteTurn, registerNarrator } from './narrator'
import { DRACULA } from './palette'
import { countTool, registerTurnStats, startTurnStats } from './turn-stats'

export const register: Register = (on, options) => {
  registerTurnStats(on, options)
  registerNarrator(on, options)

  on('turn.start', async ($, e, next) => {
    await startTurnStats($)
    noteTurn(e)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    countTool(e, result)
    await noteTool($, e, result)
    return result
  }).catch(($, e, next) => next(e))

  // Your prompts: padded box in the prompt colour
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    // skip task notifications and messages from other agents; style everything you sent (live or resumed)
    if (e.props.task || e.props.from) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box backgroundColor={DRACULA.currentLine} paddingX={2} paddingY={1} marginTop={1}>
        <Text>{e.props.text}</Text>
      </Box>
    )
  })

  // Claude's replies: padded box in the reply colour, markdown in Dracula colours
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const t = $.ui.resolve(e)
    const { Box } = t
    return (
      <Box backgroundColor={DRACULA.background} paddingX={2} paddingY={1} marginTop={1}>
        {renderMarkdown(e.props.text, t)}
      </Box>
    )
  })
}
