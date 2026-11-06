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

test('details start collapsed and a press opens them', async ($) => {
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'm3',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'Intro\n<details>\n<summary>More</summary>\nHidden **body**\n</details>', isFirstOfReply: true },
  } as any)
  expect(await ui.find({ type: 'Text', text: /More/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Hidden/ })).toBeFalsy()
  await ui.press({ key: 'details-0' })
  expect(await ui.find({ type: 'Text', text: /Hidden/ })).toBeTruthy()
  await ui.press({ key: 'details-0' })
  expect(await ui.find({ type: 'Text', text: /Hidden/ })).toBeFalsy()
  await ui.unmount()
})

test('details with attributes, capitals, inline tags or inside a list still collapse and open', async ($) => {
  const cases: [string, string][] = [
    ['attributes', '<details open>\n<summary>More</summary>\nHidden body\n</details>'],
    ['capitals', '<DETAILS>\n<SUMMARY>More</SUMMARY>\nHidden body\n</DETAILS>'],
    ['inline open', 'Intro <details>\n<summary>More</summary>\nHidden body\n</details>'],
    ['text after the close', '<details>\n<summary>More</summary>\nHidden body\n</details> After'],
    ['inside a list item', '1. Item\n   <details>\n   <summary>More</summary>\n   Hidden body\n   </details>'],
    ['summary with attributes', '<details>\n<summary class="x">More</summary>\nHidden body\n</details>'],
    ['all on one line', '<details><summary>More</summary>Hidden body</details>'],
    ['carriage returns', 'Intro\r\n<details>\r\n<summary>More</summary>\r\nHidden body\r\n</details>'],
  ]
  for (const [name, text] of cases) {
    const ui = await $.ui.mount({
      plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: `details-${name}`,
      viewport: { columns: 100, rows: 40 },
      props: { text, isFirstOfReply: true },
    } as any)
    expect(await ui.find({ type: 'Text', text: /<details|<DETAILS|<summary|<SUMMARY/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeFalsy()
    await ui.press({ key: 'details-0' })
    expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('a details inside another numbers after it and opens on its own', async ($) => {
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'nested-details',
    viewport: { columns: 100, rows: 40 },
    props: {
      text: '<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\nHidden body\n</details>\n\n</details>',
      isFirstOfReply: true,
    },
  } as any)
  expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeFalsy()
  await ui.press({ key: 'details-0' })
  expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeFalsy()
  await ui.press({ key: 'details-1' })
  expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeTruthy()
  await ui.press({ key: 'details-1' })
  expect(await ui.find({ type: 'Text', text: /Hidden body/ })).toBeFalsy()
  await ui.unmount()
})

test('details tags inside a fenced code block are left as code', async ($) => {
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'fenced-details',
    viewport: { columns: 100, rows: 40 },
    props: { text: '```html\n<details>\n<summary>More</summary>\n</details>\n```', isFirstOfReply: true },
  } as any)
  expect(await ui.find({ type: 'Code', text: /<details>/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button' })).toBeFalsy()
  await ui.unmount()
})

test('code and tables indented under a list item nest under it, and summary html becomes markdown', async ($) => {
  const ui = await $.ui.mount({
    plugin: 'dracula', surface: 'terminal', component: 'AssistantMessage', requestId: 'm4',
    viewport: { columns: 100, rows: 40 },
    props: {
      text: '<details>\n<summary><b>Palette</b></summary>\n\n1. Code:\n   ```bash\n   claude --plugin-dir .\n   ```\n2. Table:\n   | A | B |\n   |---|---|\n   | x | y |\n</details>',
      isFirstOfReply: true,
    },
  } as any)
  expect(await ui.find({ type: 'Text', text: /<b>/ })).toBeFalsy()
  await ui.press({ key: 'details-0' })
  expect(await ui.find({ type: 'Text', text: /```/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /\|---/ })).toBeFalsy()
  await ui.unmount()
})
