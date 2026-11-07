// A pressed path: text in ttt (the open one, else a new herdr tab), anything else with the system's `open`.

import type { EngineInterface } from 'claude-code'

import type { FileRef } from './file-links'

type Pane = { pane_id: string; tab_id: string }
type Process = { name?: string; argv0?: string; pid: number }
type Terminal = { address: string }
type Foreground = { name?: string; argv?: string[]; pid: number }

// herdr-app runs herdr-core (`hc`) for terminals and `herdr-app` for the window
type Host = { hc: string; app: string } | { herdr: string }

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

// with no running editor to take the file ttt opens one on the terminal it has; without one it fails instead
const DETACHED = 'use POSIX; if (my $pid = fork) { waitpid($pid, 0); exit($? >> 8) } setsid(); open(STDIN, "<", "/dev/null"); exec @ARGV'

export const isText = (mime: string) =>
  !/^(image|video|audio)\//.test(mime) && (!/charset=binary/.test(mime) || /^inode\/x-empty/.test(mime))

async function json($: EngineInterface, argv: string[]) {
  const run = await $.process.run(argv, { timeoutMs: 10_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `${argv.slice(0, 3).join(' ')} failed`)
  return JSON.parse(run.stdout)
}

async function has($: EngineInterface, command: string) {
  return (await $.process.run(['sh', '-c', `command -v ${command}`])).exitCode === 0
}

// inside herdr-app when herdr-core gave this terminal an address and the window answers; else the older herdr
async function hostOf($: EngineInterface): Promise<Host | undefined> {
  if (await $.env.get('HC_TERMINAL_ID')) {
    if (!(await has($, 'hc')) || !(await has($, 'herdr-app'))) return undefined
    const window = await $.process.run(['herdr-app', 'status'], { timeoutMs: 10_000 }).catch(() => undefined)
    return window?.exitCode === 0 ? { hc: 'hc', app: 'herdr-app' } : undefined
  }
  if ((await $.env.get('HERDR_ENV')) === '1') return { herdr: (await $.env.get('HERDR_BIN_PATH')) || 'herdr' }
  return undefined
}

const isTtt = (argv0?: string, name?: string) => name === 'ttt' || /(^|\/)ttt$/.test(argv0 ?? '')

type Running<T> = { target: T; pid: number }

// the newest ttt wins: it is the one a person is most likely looking at
function newest<T>(running: (Running<T> | undefined)[]) {
  return running
    .filter((r): r is Running<T> => r !== undefined)
    .sort((a, b) => b.pid - a.pid)[0]?.target
}

async function tttPane($: EngineInterface, herdr: string) {
  const panes: Pane[] = (await json($, [herdr, 'pane', 'list'])).result.panes
  const running = await Promise.all(panes.map(async pane => {
    const info = await json($, [herdr, 'pane', 'process-info', '--pane', pane.pane_id]).catch(() => undefined)
    const procs: Process[] = info?.result.process_info.foreground_processes ?? []
    const ttt = procs.find(p => isTtt(p.argv0, p.name))
    return ttt ? { target: pane, pid: ttt.pid } : undefined
  }))
  return newest(running)
}

async function tttTerminal($: EngineInterface, hc: string) {
  const terminals: Terminal[] = (await json($, [hc, 'ls', '--json'])).terminals ?? []
  const running = await Promise.all(terminals.map(async terminal => {
    const info = await json($, [hc, 'get', terminal.address]).catch(() => undefined)
    const foreground: Foreground | undefined = info?.foreground
    return foreground && isTtt(foreground.argv?.[0], foreground.name) ? { target: terminal, pid: foreground.pid } : undefined
  }))
  return newest(running)
}

async function focus($: EngineInterface, host: Host, pane: Pane | Terminal) {
  if ('herdr' in host) return $.process.run([host.herdr, 'tab', 'focus', (pane as Pane).tab_id])
  return $.process.run([host.app, 'do', 'pane.focus', '--terminal', (pane as Terminal).address])
}

async function newTab($: EngineInterface, host: Host, cwd: string, target: string) {
  if ('herdr' in host) {
    const tab = await json($, [host.herdr, 'tab', 'create', '--cwd', cwd, '--label', 'ttt', '--focus'])
    return $.process.run([host.herdr, 'pane', 'run', tab.result.root_pane.pane_id, `ttt ${quote(cwd)} ${quote(target)}`])
  }
  return $.process.run([host.app, 'do', 'tab.new', '--name', 'ttt', '--folder', cwd, '--argv', JSON.stringify(['ttt', cwd, target])])
}

export async function openFile($: EngineInterface, ref: FileRef) {
  const text = ref.kind === 'file' && isText((await $.process.run(['file', '-b', '--mime', '--', ref.path])).stdout)
  const host = await hostOf($)
  if (!text || !host || !(await has($, 'ttt'))) {
    await $.process.run(['open', ref.path])
    return
  }
  const target = ref.line ? `${ref.path}:${ref.line}${ref.column ? `:${ref.column}` : ''}` : ref.path
  const canReuse = (await $.process.run(['ttt', '--help']).catch(() => undefined))?.stdout.includes('--new-window')
  const pane = canReuse ? ('hc' in host ? await tttTerminal($, host.hc) : await tttPane($, host.herdr)) : undefined
  if (pane) {
    const reused = await $.process.run(['perl', '-e', DETACHED, 'ttt', target], { timeoutMs: 4_000 }).catch(() => undefined)
    if (reused?.exitCode === 0) {
      await focus($, host, pane)
      return
    }
    $.ui.toast('ttt did not take the file: set "reuseWindow": true in ttt\'s settings.json')
  }
  const cwd = await $.session.cwd()
  const opened = await newTab($, host, cwd, target).catch(() => undefined)
  if (opened === undefined || opened.exitCode !== 0) await $.process.run(['open', ref.path])
}
