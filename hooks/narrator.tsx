import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, ToolCallInput, ToolCallResult, TurnStartInput } from 'claude-code'

import { LINUX, MACOS, WINDOWS, powershell } from './narrator-speaker'
import { cut, guessLanguage, parseNarration, plain } from './narrator-text'
import { PALETTE } from './palette'
import { renderQuickSwitches, restoreQuickSwitches } from './quick-switches'

type Platform = 'macos' | 'windows' | 'linux' | 'other'
type Command = { argv: string[]; env: Record<string, string> }
type Narration = { isActive: boolean; abort: AbortController }
type LinuxSpeech = { tool?: 'spd-say' | 'espeak-ng' | 'espeak'; languages: Set<string> }

const STORE_KEY = 'narratorEnabled'
const SWITCH_ON = { label: '󰕾', color: PALETTE.green }
const SWITCH_OFF = { label: '󰖁', color: PALETTE.comment }
const MAX_ACTIONS = 40
const DETAILS = ['description', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'skill', 'command', 'prompt']
const LANGUAGE_CODE = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i
const NARRATOR = `You are the voice of Claude Code, a coding assistant. After each of its turns you tell the user, out loud, what Claude just did, speaking as Claude in the first person.

You get the user's request, the actions Claude took and Claude's final message. Say what a colleague would say to explain it: what was done, how it turned out, and anything the user has to do or decide now. If Claude only answered a question, give the gist of the answer.

Speak the language the user wrote the request in; if that is unclear, the language of Claude's final message.

Rules:
- A speech synthesizer reads it aloud: plain sentences only. No markdown, lists, emojis or code, and no file paths, URLs, hashes or version strings read out character by character: name files and commands the way a person says them ("the register file", "the tests").
- One sentence for a small answer, two for a large change; never more than two sentences or 45 words.
- No preamble ("Sure", "In summary"), no questions back, nothing Claude did not say or do.

Reply in exactly this form: the first line holds only the ISO 639-1 code of the language you speak (es, en, pt, fr...), and the narration starts on the second line.`

const enabled = atom({ plugin: 'alejandrocantero-claude-mod', key: 'narratorEnabled' } as const, false)

let settings = { voice: '', model: 'haiku' }
let request = ''
let actions: string[] = []
let current: Narration | undefined
let platform: Promise<Platform> | undefined
let wsl: Promise<boolean> | undefined
let linuxSpeech: Promise<LinuxSpeech> | undefined
let hasWarned = false

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function describe(e: object) {
  const input = e as Record<string, unknown>
  const detail = DETAILS.map(key => input[key]).find(value => typeof value === 'string' && value.trim() !== '')
  return detail === undefined ? String(input.tool) : `${String(input.tool)}: ${cut(String(detail).replace(/\s+/g, ' '), 200)}`
}

function brief(answer: string) {
  const did = actions.length > 0 ? actions.map(action => `- ${action}`).join('\n') : '(no tools: Claude only answered)'
  return [
    `The user's request:\n<request>\n${cut(request, 2000) || '(none: Claude went on by itself)'}\n</request>`,
    `What Claude did, in order:\n${did}`,
    `Claude's final message to the user:\n<message>\n${cut(answer, 6000)}\n</message>`,
  ].join('\n\n')
}

function platformOf($: EngineInterface) {
  platform ??= (async (): Promise<Platform> => {
    if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
    const name = (await $.process.run(['uname', '-s']).catch(() => undefined))?.stdout.trim()
    return name === 'Darwin' ? 'macos' : name === 'Linux' ? 'linux' : 'other'
  })()
  return platform
}

function wslOf($: EngineInterface) {
  wsl ??= (async () => (await platformOf($)) === 'linux' && (await $.env.get('WSL_DISTRO_NAME')) !== undefined)()
  return wsl
}

function languagesIn(table: string) {
  const languages = new Set<string>()
  for (const line of table.split('\n').slice(1)) {
    const code = line.trim().split(/\s+/).slice(1).find(word => LANGUAGE_CODE.test(word))
    if (code) languages.add(code.split(/[-_]/)[0]!.toLowerCase())
  }
  return languages
}

function linuxSpeechOf($: EngineInterface) {
  linuxSpeech ??= (async (): Promise<LinuxSpeech> => {
    const found = (await $.process.run(['sh', '-c', 'command -v spd-say espeak-ng espeak']).catch(() => undefined))?.stdout ?? ''
    const paths = found.split('\n').map(path => path.trim())
    const tool = (['spd-say', 'espeak-ng', 'espeak'] as const).find(name => paths.some(path => path.endsWith(`/${name}`)))
    if (!tool) return { languages: new Set() }
    const listed = await $.process.run(tool === 'spd-say' ? ['spd-say', '-L'] : [tool, '--voices'], { timeoutMs: 5000 }).catch(() => undefined)
    return { tool, languages: languagesIn(listed?.stdout ?? '') }
  })()
  return linuxSpeech
}

async function speakersFor($: EngineInterface, text: string, language: string): Promise<Command[]> {
  const env = { NARRATOR_TEXT: text, NARRATOR_LANG: language, NARRATOR_VOICE: settings.voice }
  const system = await platformOf($)
  if (system === 'macos') return [{ argv: ['osascript', '-l', 'JavaScript', '-e', MACOS], env }]
  if (system === 'windows') return [{ argv: powershell(WINDOWS), env }]
  if (system !== 'linux') return []

  const speakers: Command[] = []
  if (await wslOf($)) {
    const inherited = await $.env.get('WSLENV')
    const crossing = [inherited, 'NARRATOR_TEXT/u', 'NARRATOR_LANG/u', 'NARRATOR_VOICE/u'].filter(Boolean).join(':')
    speakers.push({ argv: powershell(WINDOWS, 'powershell.exe'), env: { ...env, WSLENV: crossing } })
  }
  const { tool, languages } = await linuxSpeechOf($)
  const lang = language && (languages.size === 0 || languages.has(language) ? language : 'en')
  if (tool === 'spd-say') {
    const options = [...(lang ? ['-l', lang] : []), ...(settings.voice ? ['-y', settings.voice] : [])]
    speakers.push({ argv: ['sh', '-c', LINUX, 'narrator', 'spd-say', '-w', ...options, '--', text], env: { ...env, NARRATOR_STOP: 'spd-say -S' } })
  } else if (tool) {
    const voice = settings.voice || lang
    speakers.push({ argv: ['sh', '-c', LINUX, 'narrator', tool, ...(voice ? ['-v', voice] : []), '--', text], env })
  }
  return speakers
}

async function play($: EngineInterface, narration: Narration, command: Command) {
  let said = ''
  let failure = ''
  try {
    for await (const { text } of $.process.spawn(command)) {
      said = (said + text.replace(/^\.\r?$/gm, '')).slice(-4000)
      if (!narration.isActive) break
    }
  } catch (error) {
    failure = message(error)
  }
  const voice = /^voice (.+?)\r?$/m.exec(said)?.[1]
  failure ||= /^error.*$/m.exec(said)?.[0] ?? (voice ? '' : `${command.argv[0]} said nothing`)
  const pid = /^pid (\d+)/m.exec(said)?.[1]
  if (!narration.isActive && pid && command.argv[0] === 'powershell.exe') {
    await $.process.run(['taskkill.exe', '/PID', pid, '/T', '/F']).catch(() => undefined)
  }
  if (!narration.isActive) return true
  $.ui.log(failure ? `narrator: ${command.argv[0]}: ${failure}` : `narrator: spoke with ${voice}`, { to: 'debug' })
  return failure === ''
}

async function speak($: EngineInterface, narration: Narration, text: string, language: string) {
  for (const command of await speakersFor($, text, language)) {
    if (await play($, narration, command)) return
    if (!narration.isActive) return
  }
  try {
    await $.audio.speak(text, settings.voice ? { voice: settings.voice } : undefined)
  } catch (error) {
    $.ui.log(`narrator: ${message(error)}`, { to: 'debug' })
    if (hasWarned) return
    hasWarned = true
    const system = await platformOf($)
    $.ui.toast(system === 'linux'
      ? 'Narrator: no voice to speak with. Install speech-dispatcher (spd-say) or espeak-ng.'
      : `Narrator: no voice to speak with (${message(error)}).`)
  }
}

function silence() {
  if (!current) return
  current.isActive = false
  current.abort.abort()
  current = undefined
}

async function narrate($: EngineInterface, answer: string) {
  silence()
  const narration: Narration = { isActive: true, abort: new AbortController() }
  current = narration
  try {
    const reply = await $.model.complete(
      { model: settings.model, system: NARRATOR, prompt: brief(answer), maxTokens: 400, effort: 'low', timeoutMs: 30_000 },
      { signal: narration.abort.signal },
    ).catch(() => undefined)
    if (!narration.isActive) return
    const told = reply?.isAnswered ? parseNarration(reply.text) : undefined
    const { text, language } = told?.text ? told : { text: cut(plain(answer), 600), language: guessLanguage(answer) }
    if (text) await speak($, narration, text, language)
  } catch (error) {
    $.ui.log(`narrator: ${message(error)}`, { to: 'debug' })
  } finally {
    if (current === narration) current = undefined
  }
}

async function setEnabled($: EngineInterface, value?: boolean) {
  let isEnabled = false
  await update($, enabled, now => (isEnabled = value ?? !now))
  if (!isEnabled) silence()
  await $.store.set(STORE_KEY, isEnabled)
  return isEnabled
}

function isBlank(node: RenderNode | undefined): boolean {
  if (node === undefined || node === null) return true
  if (typeof node === 'string') return node.trim() === ''
  return (node.type === 'Box' || node.type === 'Text') && (node.children ?? []).every(isBlank)
}

export function noteTurn(e: TurnStartInput) {
  if (e.agentId !== undefined) return
  if (e.text) request = e.text
  actions = []
}

export async function noteTool($: EngineInterface, e: ToolCallInput, result: ToolCallResult) {
  if (e.agentId !== undefined || actions.length >= MAX_ACTIONS || !(await read($, enabled))) return
  actions.push(describe(e) + ('deny' in result ? ' (denied)' : result.isError ? ' (failed)' : ''))
}

export const registerNarrator: Register = (on, options) => {
  settings = {
    voice: String(options.narratorVoice ?? '').trim(),
    model: String(options.narratorModel || 'haiku'),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'narrator',
      description: 'Claude tells you out loud what it did after each turn · no argument: switch on or off',
      argumentHint: '[on | off | stop]',
      immediate: true,
    })
    const isEnabled = (await $.store.get(STORE_KEY)) === true
    await update($, enabled, () => isEnabled)
    await restoreQuickSwitches($)
    return next(e)
  })

  on('session.end', ($, e, next) => {
    silence()
    return next(e)
  })

  on('command.run', { command: 'narrator' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'stop') {
      silence()
      return { text: 'Narrator: quiet.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Usage: /narrator [on | off | stop]' }
    const isEnabled = await setEnabled($, arg === '' ? undefined : arg === 'on')
    return { text: isEnabled ? 'Narrator on: Claude will tell you out loud what it did after each turn.' : 'Narrator off.' }
  })

  on('prompt.submit', ($, e, next) => {
    silence()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.answer.trim() && (await read($, enabled))) void narrate($, e.answer)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const isEnabled = await read($, enabled)
    const beneath = await next(e)
    const hasBeneath = e.props.modes.length > 0 || !isBlank(beneath)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { label, color } = isEnabled ? SWITCH_ON : SWITCH_OFF
    const quick = await renderQuickSwitches($, { Box, Button, Text })

    return (
      <Box flexDirection="row">
        {hasBeneath ? beneath : null}
        {hasBeneath ? <Text> </Text> : null}
        {quick}
        <Text>  </Text>
        <Button key="narrator" plain onPress={() => void setEnabled($)}>
          <Text color={color}>{label}</Text>
        </Button>
      </Box>
    )
  })
}
