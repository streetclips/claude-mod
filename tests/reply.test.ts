import { test, expect } from 'claude-code/testing'

test('reply renders with custom markdown', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, () => null as any)
  const tree = await $.ui.render({
    surface: 'terminal', component: 'AssistantMessage', requestId: 'm1',
    props: { text: '### Head\n\nUse `foo()` and **bold**.\n\n- item', isFirstOfReply: true },
  } as any)
  expect(JSON.stringify(tree)).toContain('#50fa7b')
})

test('longer fence keeps inner fences and closes before the next block', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, () => null as any)
  const tree = await $.ui.render({
    surface: 'terminal', component: 'AssistantMessage', requestId: 'm2',
    props: { text: '````markdown\nA\n```php\nx\n```\n````\n\n**Two**', isFirstOfReply: true },
  } as any)
  const json = JSON.stringify(tree)
  expect(json).toContain('```php')
  expect(json).not.toContain('**Two**')
})
