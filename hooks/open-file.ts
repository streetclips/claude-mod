// A pressed path: text in the space's ttt (compact-tabs' IDE tab) or a Herdr desktop app editor tab, anything else with the system's `open`.

import type { EngineInterface } from 'claude-code'

import type { FileRef } from './file-links'

const EDITOR = 'compact-editor'
const IDE = 'compact-tabs'

export const isText = (mime: string) =>
  !/^(image|video|audio)\//.test(mime) && (!/charset=binary/.test(mime) || /^inode\/x-empty/.test(mime))

async function inHerdrApp($: EngineInterface) {
  if (!(await $.env.get('HC_TERMINAL_ID'))) return false
  if ((await $.process.run(['sh', '-c', 'command -v herdr-app'])).exitCode !== 0) return false
  const window = await $.process.run(['herdr-app', 'status'], { timeoutMs: 10_000 }).catch(() => undefined)
  return window?.exitCode === 0
}

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const position = (ref: FileRef) => ({
  ...(ref.line ? { line: Number(ref.line) } : {}),
  ...(ref.column ? { column: Number(ref.column) } : {}),
})

async function openInSpaceIde($: EngineInterface, ref: FileRef) {
  const request = { file: ref.path, ...position(ref), terminal: await $.env.get('HC_TERMINAL_ID') }
  const command = `${IDE}.open:${encodeURIComponent(JSON.stringify(request))}`
  const opened = await $.process.run(['herdr-app', 'do', command], { timeoutMs: 10_000 }).catch(() => undefined)
  return opened?.exitCode === 0
}

async function openInEditor($: EngineInterface, ref: FileRef) {
  const tab = { name: basename(ref.path), mod: EDITOR, props: { file: ref.path, ...position(ref) } }
  const opened = await $.process.run(['herdr-app', 'do', 'tab.new', JSON.stringify(tab)], { timeoutMs: 10_000 }).catch(() => undefined)
  return opened?.exitCode === 0
}

export async function openFile($: EngineInterface, ref: FileRef) {
  const text = ref.kind === 'file' && isText((await $.process.run(['file', '-b', '--mime', '--', ref.path])).stdout)
  if (text && (await inHerdrApp($)) && ((await openInSpaceIde($, ref)) || (await openInEditor($, ref)))) return
  await $.process.run(['open', ref.path])
}
