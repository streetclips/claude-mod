// A small markdown renderer with our own colours, for replies.
// Tables fall back to the engine's Markdown element.

import { fileUrl, type FileRef } from './file-links'
import { DRACULA } from './palette'

export const MD: Record<'code' | 'bold' | 'heading' | 'link' | 'bullet' | 'quote' | 'rule', string> = {
  code: DRACULA.green,
  bold: DRACULA.orange,
  heading: DRACULA.purple,
  link: DRACULA.cyan,
  bullet: DRACULA.pink,
  quote: DRACULA.comment,
  rule: DRACULA.comment,
}

type El = any
export type Files = { refs: Record<string, FileRef>; open: (ref: FileRef) => Promise<void>; count: number }
type Table = { Box: any; Text: any; Link: any; Code: any; Markdown: any; Button: any; files?: Files }
export type Details = { open: number[]; toggle: (index: number) => void }
type Run = { text: string; style?: Record<string, unknown>; href?: string; file?: FileRef }

// `code`, **bold**, *italic* / _italic_, [text](url)
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*\*)|(\b_[^_\n]+_\b)/g

function runs(s: string, t: Table): Run[] {
  const out: Run[] = []
  let last = 0
  for (const m of s.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: s.slice(last, at) })
    const tok = m[0]
    if (m[1]) {
      const code = tok.slice(1, -1)
      const file = t.files?.refs[code]
      out.push({ text: code, style: { color: MD.code }, file, href: file && fileUrl(file.path) })
    } else if (m[2]) out.push({ text: tok.slice(2, -2), style: { bold: true, color: MD.bold } })
    else if (m[3]) {
      const [, label = '', target = ''] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? []
      const file = t.files?.refs[target]
      const href = /^(https?|file):/.test(target) ? target : file && fileUrl(file.path)
      out.push({ text: label, style: { color: MD.link, underline: true }, file, href })
    } else out.push({ text: tok.slice(1, -1), style: { italic: true } })
    last = at + tok.length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
}

export function inline(s: string, t: Table, keyBase: string): El[] {
  const { Text, Link } = t
  return runs(s, t).map((r, k) => {
    const key = `${keyBase}-${k}`
    if (!r.style) return r.text
    return r.href
      ? <Link key={key} href={r.href}><Text {...r.style}>{r.text}</Text></Link>
      : <Text key={key} {...r.style}>{r.text}</Text>
  })
}

// a Button cannot sit inside a Text: a line naming files is laid out word by word, each file a Button
function flow(s: string, t: Table, keyBase: string): El {
  const { Box, Text, Link, Button } = t
  const all = runs(s, t)
  const files = t.files
  if (!files || !all.some(r => r.file)) return <Text>{inline(s, t, keyBase)}</Text>
  const items: El[] = []
  all.forEach((r, k) => {
    const key = `${keyBase}-${k}`
    const file = r.file
    if (file) {
      items.push(
        <Button key={`file-${files.count++}`} plain onPress={() => files.open(file)}>
          <Text {...r.style}>{r.text}</Text>
        </Button>,
      )
    } else if (r.href) items.push(<Text key={key}><Link href={r.href}><Text {...r.style}>{r.text}</Text></Link></Text>)
    else {
      for (const [w, word] of (r.text.match(/\s*\S+\s*|\s+/g) ?? []).entries()) {
        items.push(<Text key={`${key}-${w}`} {...r.style}>{word}</Text>)
      }
    }
  })
  return <Box flexDirection="row" flexWrap="wrap">{items}</Box>
}

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/
const BLOCK_START = /^\s*(`{3,}|~{3,}|\||<details>|#{1,6}\s|>)/
const indentOf = (l: string) => (l.match(/^\s*/)?.[0] ?? '').length

// <b>/<strong>, <i>/<em> and <code> become their markdown; any other tag is dropped
export const htmlToMarkdown = (s: string) => s
  .replace(/<\/?(b|strong)>/gi, '**')
  .replace(/<\/?(i|em)>/gi, '*')
  .replace(/<\/?code>/gi, '`')
  .replace(/<\/?[a-z][^>]*>/gi, '')

export function renderMarkdown(src: string, t: Table, details: Details = { open: [], toggle: () => {} }): El {
  const { Box, Text, Code, Markdown, Button } = t
  const lines = src.replace(/\s+$/, '').split('\n')
  let detailsCount = 0
  const blocks: El[] = []
  let i = 0
  const push = (el: El) => blocks.push(
    <Box key={`b${blocks.length}`} marginTop={blocks.length ? 1 : 0} flexDirection="column">{el}</Box>,
  )

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (!line.trim()) { i++; continue }

    // ```lang fenced code
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^`\s]*)/)
    if (fence) {
      const marker = fence[1] ?? '```'
      const close = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
      const body: string[] = []
      i++
      while (i < lines.length && !close.test(lines[i] ?? '')) body.push(lines[i++] ?? '')
      i++
      push(<Code source={body.join('\n')} language={fence[2] || undefined} />)
      continue
    }

    // <details><summary>…</summary> … </details>, collapsed until pressed
    if (/^\s*<details>/.test(line)) {
      const body: string[] = []
      let summary = ''
      let rest = line.replace(/^\s*<details>/, '')
      let depth = 1
      i++
      while (true) {
        const s = rest.match(/^\s*<summary>(.*?)<\/summary>(.*)$/)
        if (!summary && s) { summary = s[1] ?? ''; rest = s[2] ?? '' }
        depth += (rest.match(/<details>/g) ?? []).length - (rest.match(/<\/details>/g) ?? []).length
        if (depth <= 0) { body.push(rest.replace(/<\/details>\s*$/, '')); break }
        if (rest.trim()) body.push(rest)
        if (i >= lines.length) break
        rest = lines[i++] ?? ''
      }
      const index = detailsCount++
      const isOpen = details.open.includes(index)
      push(
        <Box flexDirection="column">
          <Button key={`details-${index}`} plain onPress={() => details.toggle(index)}>
            <Text color={MD.bullet}>{isOpen ? '▾ ' : '▸ '}</Text>
            <Text bold>{inline(htmlToMarkdown(summary) || 'Details', t, `s${index}`)}</Text>
          </Button>
          {isOpen ? <Box paddingLeft={2} marginTop={1}>{renderMarkdown(body.join('\n'), t)}</Box> : null}
        </Box>,
      )
      continue
    }

    // tables: hand to the engine
    if (/^\s*\|/.test(line)) {
      const rows: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) rows.push(lines[i++] ?? '')
      push(<Markdown text={rows.join('\n')} />)
      continue
    }

    // # headings
    const head = line.match(/^(#{1,6})\s+(.*)$/)
    if (head) {
      push(<Text bold color={MD.heading}>{inline(head[2] ?? '', t, `h${i}`)}</Text>)
      i++
      continue
    }

    // --- rule
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      push(<Text color={MD.rule}>{'─'.repeat(40)}</Text>)
      i++
      continue
    }

    // > quote
    if (/^\s*>/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) q.push((lines[i++] ?? '').replace(/^\s*>\s?/, ''))
      push(
        <Box flexDirection="row">
          <Text color={MD.quote}>│ </Text>
          <Text color={MD.quote}>{inline(q.join(' '), t, `q${i}`)}</Text>
        </Box>,
      )
      continue
    }

    // - / * / 1. lists (with nesting by indent)
    if (LIST_ITEM.test(line)) {
      const items: El[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
        if (m) {
          const depth = Math.floor((m[1] ?? '').length / 2)
          const marker = /\d/.test(m[2] ?? '') ? (m[2] ?? '') : '•'
          const indent = (m[1] ?? '').length
          let text = m[3] ?? ''
          const child: string[] = []
          let fence: string | null = null
          i++
          // lines indented under the item: plain text continues it, a block (code, table, …) nests under it
          while (i < lines.length) {
            const c = lines[i] ?? ''
            const f = c.match(/^\s*(`{3,}|~{3,})(.*)$/)
            if (!fence) {
              if (!c.trim()) {
                const next = lines.slice(i + 1).find(x => x.trim())
                if (!child.length || !next || indentOf(next) <= indent || LIST_ITEM.test(next)) break
                child.push(c)
                i++
                continue
              }
              if (indentOf(c) <= indent || LIST_ITEM.test(c)) break
            }
            if (f) {
              const mark = f[1] ?? ''
              if (!fence) fence = mark
              else if (mark[0] === fence[0] && mark.length >= fence.length && !(f[2] ?? '').trim()) fence = null
            }
            if (!child.length && !f && !BLOCK_START.test(c)) text += ' ' + c.trim()
            else child.push(c)
            i++
          }
          const cut = Math.min(...child.filter(x => x.trim()).map(indentOf))
          items.push(
            <Box key={`li${i}`} flexDirection="row" paddingLeft={depth * 2}>
              <Box width={marker.length + 1} flexShrink={0}><Text color={MD.bullet}>{marker}</Text></Box>
              <Box flexGrow={1} flexShrink={1} flexDirection="column">
                {flow(text, t, `li${i}`)}
                {child.length ? <Box marginTop={1}>{renderMarkdown(child.map(x => x.slice(cut)).join('\n'), t)}</Box> : null}
              </Box>
            </Box>,
          )
        } else break
      }
      push(<Box flexDirection="column">{items}</Box>)
      continue
    }

    // paragraph: join until a blank line or another block starts
    const para: string[] = []
    while (i < lines.length) {
      const l = lines[i] ?? ''
      if (!l.trim() || /^\s*(```|~~~|<details>|\||#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(l)) break
      para.push(l.trim())
      i++
    }
    push(flow(para.join(' '), t, `p${i}`))
  }

  return <Box flexDirection="column">{blocks}</Box>
}
