import { test, expect } from 'claude-code/testing'

import { fileUrl } from '../hooks/file-links'
import { isText } from '../hooks/open-file'

const FILES: Record<string, 'file' | 'dir'> = { 'hooks/markdown.tsx': 'file', 'README.md': 'file', "it's.md": 'file', 'logo.png': 'file', src: 'dir', '.config/herdr-app': 'dir' }
// what a walk of the workspace finds, node_modules and vendor included
const TREE: Record<string, 'file' | 'dir'> = {
  ...FILES,
  'hooks/open-file.ts': 'file',
  'src/a/util.ts': 'file',
  'src/b/util.ts': 'file',
  'node_modules/pkg/index.js': 'file',
  'vendor/lib/helper.php': 'file',
}
type Host = { herdr?: boolean; app?: boolean; window?: boolean; editor?: boolean; mime?: string; git?: boolean; cwd?: string; gate?: Promise<void> }

function fakeHost(on: any, { herdr = false, app = true, window = true, editor = true, mime = 'text/plain; charset=us-ascii', git = false, cwd = '/repo', gate }: Host = {}) {
  const ran: string[] = []
  const done = (exitCode: number, stdout = '') =>
    ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const env: Record<string, string> = app
    ? { HOME: '/home/me', HC_TERMINAL_ID: 't2' }
    : herdr ? { HOME: '/home/me', HERDR_ENV: '1', HERDR_BIN_PATH: 'herdr' } : { HOME: '/home/me' }
  on('env.get', (_: unknown, e: { name: string }) => ({ value: env[e.name] }))
  on('session.cwd', () => ({ value: cwd }))
  on('fs.stat', (_: unknown, e: { path: string }) => {
    const file = Object.keys(TREE).find(f => e.path.replace(/\/$/, '').endsWith(`/${f}`))
    return file
      ? { value: { kind: TREE[file], size: 1, mtimeMs: 0, isLink: false, realPath: e.path.startsWith('/home/me') ? e.path : `/repo/${file}` } }
      : { deny: 'ENOENT' }
  })
  // the walk asks for `.` under the session's folder, the test's or the plugin's own
  on('fs.list', (_: unknown, e: { path?: string }) => {
    const dir = (e.path ?? '').replace(/^.*clps-claude-code-mod\/?/, '').replace(/^(\.\/|\/repo\/?)/, '').replace(/\/$/, '')
    const names = new Map<string, 'file' | 'dir'>()
    for (const [f, kind] of Object.entries(TREE)) {
      if (dir && !f.startsWith(`${dir}/`)) continue
      const rest = f.slice(dir ? dir.length + 1 : 0)
      const cut = rest.indexOf('/')
      names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? kind : 'dir')
    }
    return { value: Array.from(names, ([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    const cmd = e.argv.join(' ')
    ran.push(cmd)
    if (cmd.startsWith('file ')) return done(0, mime)
    // git lists the workspace in one call: the files, node_modules and vendor among them
    if (cmd.startsWith('git ls-files')) {
      if (!git) return done(128)
      const listed = done(0, Object.keys(TREE).join('\0'))
      return gate ? gate.then(() => listed) : listed
    }
    if (cmd === 'sh -c command -v herdr-app') return done(0)
    if (cmd === 'herdr-app status') return done(window ? 0 : 1, window ? '{}' : 'no window')
    if (cmd.startsWith('herdr-app do tab.new')) return editor ? done(0, '{"tab":"tb3","pane":"pe9"}') : done(1, '{"error":"no mod compact-editor"}')
    return done(0)
  })
  return ran
}

// the command that opens a file in an editor tab of the Herdr desktop app
function editorTab(file: string, line?: number, column?: number) {
  const props = { file, ...(line ? { line } : {}), ...(column ? { column } : {}) }
  return `herdr-app do tab.new ${JSON.stringify({ name: file.split('/').pop(), mod: 'compact-editor', props })}`
}

async function press($: any, text: string, keys: string[]) {
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: text,
    viewport: { columns: 100, rows: 40 }, props: { text, isFirstOfReply: true },
  })
  for (const key of keys) await ui.press({ key })
  await ui.unmount()
}

test('in herdr-app a text file opens in an editor tab at its line and column', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'At `hooks/markdown.tsx:4:2`', ['file-0'])
  expect(ran).toContain(editorTab('/repo/hooks/markdown.tsx', 4, 2))
  expect(ran.some(c => c.startsWith('open '))).toBe(false)
})

test('a quote in the name reaches the editor unescaped', async ($, on) => {
  const ran = fakeHost(on)
  await press($, "In `it's.md:9`", ['file-0'])
  expect(ran).toContain(editorTab("/repo/it's.md", 9))
})

test('ttt is never run', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'At `hooks/markdown.tsx:4` and `README.md`', ['file-0', 'file-1'])
  expect(ran.some(c => /(^|\s)ttt(\s|$)/.test(c))).toBe(false)
})

test('images, folders and binaries open with the system', async ($, on) => {
  const ran = fakeHost(on, { mime: 'image/png; charset=binary' })
  await press($, 'See `logo.png` and `src/`', ['file-0', 'file-1'])
  expect(ran).toContain('open /repo/logo.png')
  expect(ran).toContain('open /repo/src')
  expect(ran.some(c => c.startsWith('herdr-app do'))).toBe(false)
})

test('outside herdr a text file opens with the system', async ($, on) => {
  const ran = fakeHost(on, { app: false })
  await press($, 'See `README.md`', ['file-0'])
  expect(ran).toContain('open /repo/README.md')
})

test('in the older herdr a text file opens with the system', async ($, on) => {
  const ran = fakeHost(on, { app: false, herdr: true })
  await press($, 'See `README.md`', ['file-0'])
  expect(ran).toContain('open /repo/README.md')
  expect(ran.some(c => c.startsWith('herdr '))).toBe(false)
})

test('in herdr-app with the window closed a text file opens with the system', async ($, on) => {
  const ran = fakeHost(on, { window: false })
  await press($, 'See `README.md`', ['file-0'])
  expect(ran).toContain('open /repo/README.md')
  expect(ran.some(c => c.startsWith('herdr-app do'))).toBe(false)
})

test('when the editor tab cannot open, a text file opens with the system', async ($, on) => {
  const ran = fakeHost(on, { editor: false })
  await press($, 'See `README.md`', ['file-0'])
  expect(ran).toContain(editorTab('/repo/README.md'))
  expect(ran).toContain('open /repo/README.md')
})

test('text means a text charset, never an image, video or audio', () => {
  expect(isText('text/x-php; charset=us-ascii')).toBe(true)
  expect(isText('application/json; charset=utf-8')).toBe(true)
  expect(isText('inode/x-empty; charset=binary')).toBe(true)
  expect(isText('image/svg+xml; charset=us-ascii')).toBe(false)
  expect(isText('video/mp4; charset=binary')).toBe(false)
  expect(isText('application/pdf; charset=binary')).toBe(false)
})

test('file urls are absolute and encoded', () => {
  expect(fileUrl('/a b/c#d.ts')).toBe('file:///a%20b/c%23d.ts')
  expect(fileUrl('C:\\x\\y.ts')).toBe('file:///C:/x/y.ts')
})

test('a line range opens at its first line, and a full stop after the path is not part of it', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'See `hooks/markdown.tsx:3-13`, `README.md.` and [readme](README.md#L3-L13).', ['file-0', 'file-1', 'file-2'])
  expect(ran).toContain(editorTab('/repo/hooks/markdown.tsx', 3))
  expect(ran).toContain(editorTab('/repo/README.md'))
  expect(ran).toContain(editorTab('/repo/README.md', 3))
})

test('a path under ~ opens from the home folder', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'Settings live in `~/.config/herdr-app`.', ['file-0'])
  expect(ran).toContain('open /home/me/.config/herdr-app')
})

test('a file named in running text without its path is found in the workspace and opens', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'Open markdown.tsx:12 and README.md.', ['file-0', 'file-1'])
  expect(ran).toContain(editorTab('/repo/hooks/markdown.tsx', 12))
  expect(ran).toContain(editorTab('/repo/README.md'))
})

test('a name without its path is found with one git listing, and a direct path never walks', async ($, on) => {
  const ran = fakeHost(on, { git: true, cwd: '/repo/git' })
  await press($, 'See `hooks/markdown.tsx:4` and markdown.tsx.', ['file-0', 'file-1'])
  expect(ran.filter(c => c.startsWith('git ls-files'))).toHaveLength(1)
  expect(ran).toContain(editorTab('/repo/hooks/markdown.tsx'))
})

test('a reply naming only paths that resolve never lists the workspace', async ($, on) => {
  const ran = fakeHost(on, { git: true, cwd: '/repo/direct' })
  await press($, 'See `hooks/markdown.tsx:4` and `README.md`.', ['file-0', 'file-1'])
  expect(ran.some(c => c.startsWith('git ls-files'))).toBe(false)
})

test('the reply is drawn before the paths are looked up, and drawn again with them', async ($, on) => {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => (release = resolve))
  const ran = fakeHost(on, { git: true, cwd: '/repo/late', gate })
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'late',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'See `hooks/markdown.tsx:4` and markdown.tsx.', isFirstOfReply: true },
  } as any)
  // the look-up is still held: the box is drawn, its files are not links yet
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  expect(await ui.find({ text: /See/ })).toBeDefined()
  release()
  await ui.redraw()
  expect((await ui.findAll({ type: 'Button' })).length).toBe(2)
  expect(ran.some(c => c.startsWith('git ls-files'))).toBe(true)
  await ui.unmount()
})

test('a name inside node_modules or vendor is never inferred, nor two files it could mean', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'plain',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'See index.js, helper.php and util.ts, but src/a/util.ts is the one.', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(1)
  await ui.unmount()
})

test('a path outside the workspace is not inferred from its name', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'outside',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'See ../elsewhere/markdown.tsx and /etc/markdown.tsx.', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

test('a name inside a code block is left as it is', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'fence',
    viewport: { columns: 100, rows: 40 },
    props: { text: '```\nmarkdown.tsx\n```', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

test('files a reply names become buttons that open them; headings keep a file link', async ($, on) => {
  const ran = fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'alejandrocantero-claude-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'f1',
    viewport: { columns: 100, rows: 40 },
    props: {
      text: '# In `README.md`\n\nSee `hooks/markdown.tsx:36`, [readme](README.md#L3), `e.props.text` and `missing/file.ts:9`.',
      isFirstOfReply: true,
    },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(2)
  expect(JSON.stringify(await ui.drawn())).toContain('"href":"file:///repo/README.md"')
  await ui.press({ key: 'file-0' })
  expect(ran).toContain(editorTab('/repo/hooks/markdown.tsx', 36))
  await ui.press({ key: 'file-1' })
  expect(ran).toContain(editorTab('/repo/README.md', 3))
  await ui.unmount()
})
