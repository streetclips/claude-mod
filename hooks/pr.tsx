import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrInfoResult, PullRequest } from '../types'
import { DRACULA } from './palette'
import { VIEW_FIELDS, firstLine, threadsArgv, toInfo } from './pr-data'
import { renderPane } from './pr-view'

const PANE = 'pr-info'

const pr = atom({ plugin: 'clps-claude-code-mod', key: 'pr' } as const, null)
const info = atom({ plugin: 'clps-claude-code-mod', key: 'info' } as const, null)
const isLoading = atom({ plugin: 'clps-claude-code-mod', key: 'isLoading' } as const, false)
const toggled = atom({ plugin: 'clps-claude-code-mod', key: 'toggled' } as const, [])

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function setBand($: EngineInterface, found: PullRequest | null) {
  if (same(await read($, pr), found)) return
  await update($, pr, () => found)
}

async function refreshBand($: EngineInterface) {
  const found = await $.process
    .run(['gh', 'pr', 'view', '--json', 'number,title,author,state'], { timeoutMs: 10000 })
    .then(({ exitCode, stdout }): PullRequest | null => {
      if (exitCode !== 0) return null
      const { number, title, author, state } = JSON.parse(stdout)
      return { number, title, author: author.login, state }
    })
    .catch(() => null)
  await setBand($, found)
}

async function fetchInfo($: EngineInterface): Promise<PrInfoResult> {
  const view = await $.process.run(['gh', 'pr', 'view', '--json', VIEW_FIELDS], { timeoutMs: 20000 }).catch(() => null)
  if (!view) return { status: 'none', message: 'Could not run gh.' }
  if (view.exitCode !== 0) return { status: 'none', message: firstLine(view.stderr) || 'gh pr view failed.' }
  try {
    const raw = JSON.parse(view.stdout)
    const argv = threadsArgv(raw.url, raw.number)
    const threads = argv ? await $.process.run(argv, { timeoutMs: 20000 }).catch(() => null) : null
    const threadsRaw = threads && threads.exitCode === 0 ? JSON.parse(threads.stdout) : null
    return { status: 'ready', info: toInfo(raw, threadsRaw), fetchedAt: await $.clock.now() }
  } catch {
    return { status: 'none', message: 'Could not read the pull request from gh.' }
  }
}

async function loadInfo($: EngineInterface, isAsked: boolean) {
  if (isAsked) await update($, isLoading, () => true)
  const found = await fetchInfo($)
  const held = await read($, info)
  const isSame = held?.status === 'ready' && found.status === 'ready' ? same(held.info, found.info) : same(held, found)
  if (!isSame) await update($, info, () => found)
  const ready = found.status === 'ready' ? found.info : null
  await setBand($, ready && { number: ready.number, title: ready.title, author: ready.author, state: ready.state })
  if (isAsked) await update($, isLoading, () => false)
}

async function isPaneOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export const registerPr: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-info', description: "Toggle a sidebar with the branch's pull request" })
    await refreshBand($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const isOpen = await isPaneOpen($)
    $.clock.after(0, () => void (isOpen ? loadInfo($, false) : refreshBand($)))
    return result
  })

  on('command.run', { command: 'pr-info' }, async $ => {
    if (await isPaneOpen($)) {
      await $.ui.close({ id: PANE })
      return {}
    }
    await $.ui.open({ id: PANE, title: 'Pull request' })
    $.clock.after(0, () => void loadInfo($, true))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const t = $.ui.resolve(e)
    return renderPane({
      t,
      result: await read($, info),
      isLoading: await read($, isLoading),
      toggled: await read($, toggled),
      onToggle: id => void update($, toggled, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])),
      onRefresh: () => void loadInfo($, true),
      onOpenWeb: () => void $.process.run(['gh', 'pr', 'view', '--web']),
      onClose: () => void $.ui.close({ id: PANE }),
    })
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
