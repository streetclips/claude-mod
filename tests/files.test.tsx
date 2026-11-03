import { test, expect } from 'claude-code/testing'

import { fileUrl } from '../hooks/file-links'
import { isText } from '../hooks/open-file'

const FILES: Record<string, 'file' | 'dir'> = { 'hooks/markdown.tsx': 'file', 'README.md': 'file', "it's.md": 'file', 'logo.png': 'file', src: 'dir', '.config/ttt': 'dir' }
// what a walk of the workspace finds, node_modules and vendor included
const TREE: Record<string, 'file' | 'dir'> = {
  ...FILES,
  'hooks/open-file.ts': 'file',
  'src/a/util.ts': 'file',
  'src/b/util.ts': 'file',
  'node_modules/pkg/index.js': 'file',
  'vendor/lib/helper.php': 'file',
}
type Host = { herdr?: boolean; ttt?: boolean; tttOpen?: boolean; reuse?: boolean; mime?: string }

function fakeHost(on: any, { herdr = true, ttt = true, tttOpen = true, reuse = true, mime = 'text/plain; charset=us-ascii' }: Host = {}) {
  const ran: string[] = []
  const done = (exitCode: number, stdout = '') =>
    ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('env.get', (_: unknown, e: { name: string }) =>
    ({ value: (herdr ? ({ HOME: '/home/me', HERDR_ENV: '1', HERDR_BIN_PATH: 'herdr' } as Record<string, string>) : { HOME: '/home/me' })[e.name] }))
  on('session.cwd', () => ({ value: '/repo' }))
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
    if (cmd === 'sh -c command -v ttt') return done(ttt ? 0 : 1)
    if (cmd === 'ttt --help') return done(0, reuse ? '--new-window  Start a separate editor' : '--welcome')
    if (cmd === 'herdr pane list') {
      return done(0, JSON.stringify({ result: { panes: [{ pane_id: 'w:p1', tab_id: 'w:t1' }, { pane_id: 'w:p2', tab_id: 'w:t2' }] } }))
    }
    if (cmd.startsWith('herdr pane process-info')) {
      const procs = tttOpen && e.argv[4] === 'w:p2' ? [{ name: 'ttt', argv0: 'ttt', pid: 7 }] : [{ name: 'zsh', argv0: '-zsh', pid: 3 }]
      return done(0, JSON.stringify({ result: { process_info: { foreground_processes: procs } } }))
    }
    if (cmd.startsWith('herdr tab create')) return done(0, JSON.stringify({ result: { tab: { tab_id: 'w:t3' }, root_pane: { pane_id: 'w:p3' } } }))
    return done(0)
  })
  return ran
}

async function press($: any, text: string, keys: string[]) {
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: text,
    viewport: { columns: 100, rows: 40 }, props: { text, isFirstOfReply: true },
  })
  for (const key of keys) await ui.press({ key })
  await ui.unmount()
}

test('a text file opens in the running ttt and focuses its tab', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'At `hooks/markdown.tsx:4:2`', ['file-0'])
  expect(ran.some(c => c.startsWith('perl -e') && c.endsWith(' ttt /repo/hooks/markdown.tsx:4:2'))).toBe(true)
  expect(ran).toContain('herdr tab focus w:t2')
  expect(ran.some(c => c.startsWith('herdr tab create'))).toBe(false)
})

test('a ttt that cannot take files from outside gets a new tab and never runs on this terminal', async ($, on) => {
  const ran = fakeHost(on, { reuse: false })
  await press($, 'At `hooks/markdown.tsx:4`', ['file-0'])
  expect(ran).toContain(`herdr pane run w:p3 ttt '/repo' '/repo/hooks/markdown.tsx:4'`)
  expect(ran.some(c => c.startsWith('perl') || (c.startsWith('ttt ') && c !== 'ttt --help'))).toBe(false)
})

test('with no ttt open a text file opens in a new herdr tab', async ($, on) => {
  const ran = fakeHost(on, { tttOpen: false })
  await press($, "In `it's.md:9`", ['file-0'])
  expect(ran).toContain('herdr tab create --cwd /repo --label ttt --focus')
  expect(ran).toContain(`herdr pane run w:p3 ttt '/repo' '/repo/it'\\''s.md:9'`)
})

test('images, folders and binaries open with the system', async ($, on) => {
  const ran = fakeHost(on, { mime: 'image/png; charset=binary' })
  await press($, 'See `logo.png` and `src/`', ['file-0', 'file-1'])
  expect(ran).toContain('open /repo/logo.png')
  expect(ran).toContain('open /repo/src')
  expect(ran.some(c => c.startsWith('ttt'))).toBe(false)
})

test('outside herdr a text file opens with the system', async ($, on) => {
  const ran = fakeHost(on, { herdr: false })
  await press($, 'See `README.md`', ['file-0'])
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
  expect(ran.some(c => c.endsWith(' ttt /repo/hooks/markdown.tsx:3'))).toBe(true)
  expect(ran.some(c => c.endsWith(' ttt /repo/README.md'))).toBe(true)
  expect(ran.some(c => c.endsWith(' ttt /repo/README.md:3'))).toBe(true)
})

test('a path under ~ opens from the home folder', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'Settings live in `~/.config/ttt`.', ['file-0'])
  expect(ran).toContain('open /home/me/.config/ttt')
})

test('a file named in running text without its path is found in the workspace and opens', async ($, on) => {
  const ran = fakeHost(on)
  await press($, 'Open markdown.tsx:12 and README.md.', ['file-0', 'file-1'])
  expect(ran.some(c => c.endsWith(' ttt /repo/hooks/markdown.tsx:12'))).toBe(true)
  expect(ran.some(c => c.endsWith(' ttt /repo/README.md'))).toBe(true)
})

test('a name inside node_modules or vendor is never inferred, nor one two files could mean', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'plain',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'See index.js, helper.php and util.ts, but src/a/util.ts is the one.', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(1)
  await ui.unmount()
})

test('a path outside the workspace is not inferred from its name', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'outside',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'See ../elsewhere/markdown.tsx and /etc/markdown.tsx.', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

test('a name inside a code block is left as it is', async ($, on) => {
  fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'fence',
    viewport: { columns: 100, rows: 40 },
    props: { text: '```\nmarkdown.tsx\n```', isFirstOfReply: true },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

test('files a reply names become buttons that open them; headings keep a file link', async ($, on) => {
  const ran = fakeHost(on)
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'f1',
    viewport: { columns: 100, rows: 40 },
    props: {
      text: '# In `README.md`\n\nSee `hooks/markdown.tsx:36`, [readme](README.md#L3), `e.props.text` and `missing/file.ts:9`.',
      isFirstOfReply: true,
    },
  } as any)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(2)
  expect(JSON.stringify(await ui.drawn())).toContain('"href":"file:///repo/README.md"')
  await ui.press({ key: 'file-0' })
  expect(ran.some(c => c.endsWith(' ttt /repo/hooks/markdown.tsx:36'))).toBe(true)
  await ui.press({ key: 'file-1' })
  expect(ran.some(c => c.endsWith(' ttt /repo/README.md:3'))).toBe(true)
  await ui.unmount()
})
