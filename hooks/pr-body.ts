export type Segment = { kind: 'md'; text: string } | { kind: 'details'; summary: string; children: Segment[] }

const FENCE_MARK = '\uE000'
const DETAILS = /<(\/?)details\b[^>]*>/gi
const SUMMARY = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i

function maskFences(src: string, fences: string[]) {
  const out: string[] = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = (lines[i] ?? '').match(/^\s*(`{3,}|~{3,})/)
    if (!open) {
      out.push(lines[i] ?? '')
      continue
    }
    const marker = open[1] ?? '```'
    const block = [lines[i] ?? '']
    while (++i < lines.length) {
      block.push(lines[i] ?? '')
      if ((lines[i] ?? '').trim().startsWith(marker)) break
    }
    out.push(`${FENCE_MARK}${fences.push(block.join('\n')) - 1}${FENCE_MARK}`)
  }
  return out.join('\n')
}

function unmask(s: string, fences: string[]) {
  return s.replace(new RegExp(`${FENCE_MARK}(\\d+)${FENCE_MARK}`, 'g'), (_, i) => fences[Number(i)] ?? '')
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find(v => v !== undefined) ?? ''
}

export function htmlToMarkdown(s: string) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<img\b[^>]*>/gi, tag => {
      const src = attr(tag, 'src')
      const alt = attr(tag, 'alt') || 'image'
      return src ? `[🖼 ${alt}](${src})` : `🖼 ${alt}`
    })
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi, (tag, text) => {
      const href = attr(tag, 'href')
      return href ? `[${text}](${href})` : text
    })
    .replace(/<\/?(b|strong)\s*>/gi, '**')
    .replace(/<\/?(i|em)\s*>/gi, '_')
    .replace(/<\/?code\s*>/gi, '`')
    .replace(/<\/?(p|div|span|sub|sup|kbd|picture|source|center|small|ins|del|u)\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function inlineText(s: string) {
  return s
    .replace(/<img\b[^>]*>/gi, tag => attr(tag, 'alt'))
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseBody(src: string): Segment[] {
  const fences: string[] = []
  const text = maskFences(src.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, ''), fences)
  const root: Segment[] = []
  const stack: { summary: string; children: Segment[] }[] = []
  const target = () => stack[stack.length - 1]?.children ?? root
  const flush = (chunk: string) => {
    const md = unmask(htmlToMarkdown(chunk), fences).trim()
    if (md) target().push({ kind: 'md', text: md })
  }
  const close = () => {
    const done = stack.pop()
    if (done) target().push({ kind: 'details', summary: done.summary, children: done.children })
  }

  let last = 0
  for (const m of text.matchAll(DETAILS)) {
    const at = m.index ?? 0
    if (at < last) continue
    flush(text.slice(last, at))
    last = at + m[0].length
    if (m[1]) {
      close()
      continue
    }
    const summary = text.slice(last).match(SUMMARY)
    stack.push({ summary: summary ? inlineText(unmask(summary[1] ?? '', fences)) || 'Details' : 'Details', children: [] })
    if (summary) last += summary[0].length
  }
  flush(text.slice(last))
  while (stack.length) close()
  return root
}
