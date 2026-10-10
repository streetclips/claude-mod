import type { Register } from 'claude-code'

import { renderMarkdown } from './markdown'

// Dracula palette: https://draculatheme.com/contribute
const PROMPT_BG = '#44475a'
const REPLY_BG = '#282a36'

export const register: Register = on => {
  // Your prompts: padded box in the prompt colour
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    // skip task notifications and messages from other agents; style everything you sent (live or resumed)
    if (e.props.task || e.props.from) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box backgroundColor={PROMPT_BG} paddingX={2} paddingY={1} marginTop={1}>
        <Text>{e.props.text}</Text>
      </Box>
    )
  })

  // Claude's replies: padded box in the reply colour, markdown in Dracula colours
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const t = $.ui.resolve(e)
    const { Box } = t
    return (
      <Box backgroundColor={REPLY_BG} paddingX={2} paddingY={1} marginTop={1}>
        {renderMarkdown(e.props.text, t)}
      </Box>
    )
  })
}
