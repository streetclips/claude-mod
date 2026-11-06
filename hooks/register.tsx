import { atom, memberOf, read, update, type EngineInterface, type Register } from 'claude-code'

import { fileRefs, forgetFiles, type FileRef } from './file-links'
import { renderMarkdown } from './markdown'
import { noteTool, noteTurn, registerNarrator } from './narrator'
import { openFile } from './open-file'
import { PALETTE } from './palette'
import { countTool, registerTurnStats, startTurnStats } from './turn-stats'

const openDetails = atom({ plugin: 'alejandrocantero-claude-mod', key: 'openDetails' } as const, [])
const fileRefsOf = atom({ plugin: 'alejandrocantero-claude-mod', key: 'fileRefs' } as const, { text: '', refs: {} })

const WRITES = new Set(['Write', 'Edit', 'NotebookEdit'])

// the reply is drawn at once and its paths looked up after: the box never waits for the file system
const looking = new Set<string>()

function lookUp($: EngineInterface, e: { requestId: string }, text: string) {
  if (looking.has(e.requestId)) return
  looking.add(e.requestId)
  void fileRefs($, text)
    .catch(() => ({}))
    .then(refs => update($, memberOf(fileRefsOf, e), () => ({ text, refs })))
    .catch(() => undefined)
    .finally(() => looking.delete(e.requestId))
}

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
    if (WRITES.has(e.tool)) forgetFiles()
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
      <Box backgroundColor={PALETTE.currentLine} paddingX={2} paddingY={1} marginTop={1}>
        <Text>{e.props.text}</Text>
      </Box>
    )
  })

  // Claude's replies: padded box in the reply colour, markdown in the theme colours.
  // The box is drawn before the paths are looked up, and drawn again once they are.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    const { text, refs } = await read($, memberOf(fileRefsOf, e))
    if (text !== e.props.text) lookUp($, e, e.props.text)
    const openRef = (ref: FileRef) => openFile($, ref).catch(err => $.ui.toast(`Could not open ${ref.path}: ${err.message}`))
    const t = { ...$.ui.resolve(e), files: { refs, open: openRef, count: 0 } }
    const { Box } = t
    const member = memberOf(openDetails, e)
    const open = await read($, member)
    const toggle = (index: number) =>
      void update($, member, held => (held.includes(index) ? held.filter(n => n !== index) : [...held, index]))
    return (
      <Box backgroundColor={PALETTE.background} paddingX={2} paddingY={1} marginTop={1}>
        {renderMarkdown(e.props.text, t, { open, toggle })}
      </Box>
    )
  })
}
