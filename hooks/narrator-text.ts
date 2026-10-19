const LANGUAGE_LINE = /^\s*\W*([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?\W*\s*\n([\s\S]*)$/i
const WORDS: Record<string, string[]> = {
  en: ['the', 'and', 'is', 'to', 'of', 'it', 'you', 'that', 'with', 'for', 'this', 'are'],
  es: ['el', 'la', 'que', 'de', 'y', 'en', 'los', 'las', 'es', 'para', 'por', 'una', 'del', 'he'],
  pt: ['o', 'que', 'não', 'em', 'um', 'uma', 'os', 'você', 'está', 'do', 'da', 'foi'],
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'une', 'pour', 'que', 'dans', 'vous', 'pas'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'mit', 'für', 'sie', 'den', 'ein'],
  it: ['il', 'che', 'di', 'è', 'per', 'una', 'con', 'non', 'sono', 'gli', 'della', 'ho']
}

export function cut (text: string, size: number) {
  if (text.length <= size) return text
  const head = text.slice(0, size)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  return end > size / 2 ? head.slice(0, end + 1) : `${head.trimEnd()}…`
}

export function plain (markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+•]|\d+[.)]|>)\s+/gm, '')
    .replace(/[*_~|#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+/, '')
    .trim()
}

export function guessLanguage (text: string) {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let best = ''
  let most = 2
  for (const [language, common] of Object.entries(WORDS)) {
    const count = words.filter(word => common.includes(word)).length
    if (count > most) [best, most] = [language, count]
  }
  return best
}

export function parseNarration (reply: string) {
  const found = LANGUAGE_LINE.exec(reply.trim() + '\n')
  const text = plain(found ? found[2]! : reply)
  return { language: found ? found[1]!.toLowerCase() : guessLanguage(text), text }
}
