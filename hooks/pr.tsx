import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrInfoResult } from '../types'
import { VIEW_FIELDS, firstLine, threadsArgv, toInfo } from './pr-data'
import { renderPane } from './pr-view'

const PANE = 'pr-info'

const info = atom({ plugin: 'clps-claude-code-mod', key: 'info' } as const, null)
const isLoading = atom({ plugin: 'clps-claude-code-mod', key: 'isLoading' } as const, false)
const toggled = atom({ plugin: 'clps-claude-code-mod', key: 'toggled' } as const, [])

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

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
  if (isAsked) await update($, isLoading, () => false)
}

async function isPaneOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export const registerPr: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-info', description: "Toggle a sidebar with the branch's pull request" })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (await isPaneOpen($)) $.clock.after(0, () => void loadInfo($, false))
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
}
