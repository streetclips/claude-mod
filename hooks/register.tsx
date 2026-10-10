import type { Register } from 'claude-code'

import { renderMarkdown } from './markdown'
import { DRACULA } from './palette'

// Tools drawn as one line when they succeed; failures keep the engine's full row
const COMPACT_TOOLS: Record<string, (input: any) => string | undefined> = {
  Bash: i => i?.command,
  Read: i => i?.file_path,
  Grep: i => i?.pattern,
  Glob: i => i?.pattern,
  WebFetch: i => i?.url,
  WebSearch: i => i?.query,
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export const register: Register = on => {
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

  // Read-only and shell tools: one line with the tool, its main argument and its state
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    const summarize = COMPACT_TOOLS[e.props.tool]
    if (!summarize || e.props.isErrored || e.props.isInterrupted) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const summary = String(summarize(e.props.input) ?? '').split('\n')[0]
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box flexShrink={0}>
          <Text color={DRACULA.comment}>▸ </Text>
          <Text color={DRACULA.purple} bold>{e.props.tool}</Text>
          <Text>  </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={DRACULA.foreground} wrap="truncate-end">{summary}</Text>
        </Box>
        <Box flexShrink={0}>
          {e.props.isRunning
            ? <Text color={DRACULA.yellow}> …</Text>
            : <Text color={DRACULA.green}> ✓</Text>}
        </Box>
      </Box>
    )
  })

  // The compact row above stands for the result too
  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (!COMPACT_TOOLS[e.props.tool] || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Turn footer: just the duration, dim
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box marginTop={1}>
        <Text color={DRACULA.comment}>⏱ {formatDuration(e.props.durationMs)}</Text>
      </Box>
    )
  })
}
