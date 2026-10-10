import { test, expect } from 'claude-code/testing'

const PR = { number: 42, title: 'Add PR band', author: { login: 'streetclips' }, state: 'OPEN' }

test('band shows the pull request title and author', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(PR), stderr: '' } }) as any)
  on('session.start', () => ({ cwd: '/repo' }) as any)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as any)
  const tree = await $.ui.render({
    surface: 'terminal', component: 'AbovePrompt', requestId: 'b1',
    props: { hasSurvey: false, isWorking: false, maxRows: 10 },
  } as any)
  const text = JSON.stringify(tree)
  expect(text).toContain('Add PR band')
  expect(text).toContain('@streetclips')
  expect(text).toContain('42')
})
