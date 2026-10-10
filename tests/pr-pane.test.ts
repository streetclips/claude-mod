import { test, expect, mock } from 'claude-code/testing'

import { parseBody } from '../hooks/pr-body'

const BODY = [
  '## Summary',
  '',
  'Fixes the search.',
  '',
  '<details>',
  '<summary>Setup <b>steps</b></summary>',
  '',
  'hidden setup',
  '',
  '<details><summary>Inner</summary>deep text</details>',
  '</details>',
  '',
  '```html',
  '<details>not parsed</details>',
  '```',
].join('\n')

const VIEW = {
  number: 42,
  title: 'Fix the parking search',
  url: 'https://github.com/acme/parking/pull/42',
  state: 'OPEN',
  isDraft: false,
  author: { login: 'dev' },
  body: BODY,
  headRefName: 'feature/search',
  baseRefName: 'main',
  reviewDecision: 'CHANGES_REQUESTED',
  mergeStateStatus: 'BLOCKED',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  labels: [{ name: 'bug' }],
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'unit tests', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci.example/1' },
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci.example/2' },
    { __typename: 'StatusContext', context: 'deploy/preview', state: 'PENDING', targetUrl: 'https://ci.example/3' },
  ],
  comments: [{ id: 'IC1', author: { login: 'pm' }, body: 'Looks useful', createdAt: '2026-10-10T10:00:00Z', isMinimized: false }],
  reviews: [{ id: 'R1', author: { login: 'rev' }, body: 'Please rename this', state: 'CHANGES_REQUESTED', submittedAt: '2026-10-10T11:00:00Z' }],
  latestReviews: [{ author: { login: 'rev' }, state: 'CHANGES_REQUESTED' }],
  reviewRequests: [{ login: 'lead' }],
}

const THREADS = {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              id: 'T1', isResolved: false, isOutdated: false, path: 'src/search.ts', line: 12, originalLine: 12,
              comments: {
                nodes: [
                  { id: 'C1', author: { login: 'rev' }, body: 'Why this cast?', createdAt: '2026-10-10T11:00:00Z' },
                  { id: 'C2', author: { login: 'dev' }, body: 'The API returns a string', createdAt: '2026-10-10T11:30:00Z' },
                ],
              },
            },
            {
              id: 'T2', isResolved: true, isOutdated: true, path: 'src/old.ts', line: null, originalLine: 3,
              comments: { nodes: [{ id: 'C3', author: { login: 'rev' }, body: 'Settled point', createdAt: '2026-10-09T09:00:00Z' }] },
            },
          ],
        },
      },
    },
  },
}

const PANE_PROPS = {
  title: 'Pull request',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as any

function gh(argv: readonly string[]) {
  if (argv.includes('graphql')) return { exitCode: 0, stdout: JSON.stringify(THREADS), stderr: '' }
  return { exitCode: 0, stdout: JSON.stringify(VIEW), stderr: '' }
}

test('details blocks nest and code fences stay as written', () => {
  const list = parseBody(BODY)
  expect(list.map(s => s.kind)).toEqual(['md', 'details', 'md'])
  const details = list[1] as any
  expect(details.summary).toBe('Setup steps')
  expect(details.children[0]).toEqual({ kind: 'md', text: 'hidden setup' })
  expect(details.children[1].summary).toBe('Inner')
  expect((list[2] as any).text).toContain('<details>not parsed</details>')
})

test('/pr-info toggles a sidebar with the whole pull request', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-10T12:00:00Z') })
  const open = new Set<string>()
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: 'Pull request', isShown: true, isFocused: false, isPlaced: true })),
  }) as any)
  on('ui.open', (_$, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } } as any
  })
  on('ui.close', (_$, e) => {
    open.delete(e.id)
    return { value: undefined } as any
  })
  on('process.run', (_$, e) => ({ value: gh(e.argv) }) as any)

  await $.command.run({ command: 'pr-info' })
  await clock.settle()
  expect(open.has('pr-info')).toBe(true)

  const ui = await $.ui.mount({
    plugin: 'clps-claude-code-mod', surface: 'terminal', component: 'Pane', requestId: 'pr-info', props: PANE_PROPS,
  })
  const text = JSON.stringify(await ui.drawn())
  for (const part of [
    'Fix the parking search', 'feature/search', 'blocked', 'changes requested', '@lead', 'unit tests', 'deploy/preview',
    '1 passed or skipped', 'Fixes the search.', 'Setup steps', 'Looks useful', 'Please rename this',
    'src/search.ts:12', 'Why this cast?', 'The API returns a string', '↳ ', 'src/old.ts', '1 open / 2', '1h',
  ]) {
    expect(text).toContain(part)
  }
  expect(text).not.toContain('hidden setup')
  expect(text).not.toContain('Settled point')

  await ui.press({ key: 'toggle:42:body.1' })
  await ui.press({ key: 'toggle:thread:T2' })
  const opened = JSON.stringify(await ui.drawn())
  expect(opened).toContain('hidden setup')
  expect(opened).toContain('Inner')
  expect(opened).not.toContain('deep text')
  expect(opened).toContain('Settled point')

  await $.command.run({ command: 'pr-info' })
  expect(open.has('pr-info')).toBe(false)
})
