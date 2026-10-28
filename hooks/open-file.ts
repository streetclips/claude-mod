// A pressed path: text in ttt (the open one, else a new herdr tab), anything else with the system's `open`.

import type { EngineInterface } from 'claude-code'

import type { FileRef } from './file-links'

type Pane = { pane_id: string; tab_id: string }
type Process = { name?: string; argv0?: string; pid: number }

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

async function tttPane($: EngineInterface, herdr: string) {
  const panes: Pane[] = (await json($, [herdr, 'pane', 'list'])).result.panes
  const running = await Promise.all(panes.map(async pane => {
    const info = await json($, [herdr, 'pane', 'process-info', '--pane', pane.pane_id]).catch(() => undefined)
    const procs: Process[] = info?.result.process_info.foreground_processes ?? []
    const ttt = procs.find(p => p.name === 'ttt' || /(^|\/)ttt$/.test(p.argv0 ?? ''))
    return ttt ? { pane, pid: ttt.pid } : undefined
  }))
  return running.filter(r => r !== undefined).sort((a, b) => b.pid - a.pid)[0]?.pane
}

export async function openFile($: EngineInterface, ref: FileRef) {
  const text = ref.kind === 'file' && isText((await $.process.run(['file', '-b', '--mime', '--', ref.path])).stdout)
  const herdr = (await $.env.get('HERDR_ENV')) === '1' ? (await $.env.get('HERDR_BIN_PATH')) || 'herdr' : undefined
  if (!text || !herdr || (await $.process.run(['sh', '-c', 'command -v ttt'])).exitCode !== 0) {
    await $.process.run(['open', ref.path])
    return
  }
  const target = ref.line ? `${ref.path}:${ref.line}${ref.column ? `:${ref.column}` : ''}` : ref.path
  const canReuse = (await $.process.run(['ttt', '--help']).catch(() => undefined))?.stdout.includes('--new-window')
  const pane = canReuse ? await tttPane($, herdr) : undefined
  if (pane) {
    const reused = await $.process.run(['perl', '-e', DETACHED, 'ttt', target], { timeoutMs: 4_000 }).catch(() => undefined)
    if (reused?.exitCode === 0) {
      await $.process.run([herdr, 'tab', 'focus', pane.tab_id])
      return
    }
    $.ui.toast('ttt did not take the file: set "reuseWindow": true in ttt\'s settings.json')
  }
  const cwd = await $.session.cwd()
  const tab = await json($, [herdr, 'tab', 'create', '--cwd', cwd, '--label', 'ttt', '--focus'])
  await $.process.run([herdr, 'pane', 'run', tab.result.root_pane.pane_id, `ttt ${quote(cwd)} ${quote(target)}`])
}
