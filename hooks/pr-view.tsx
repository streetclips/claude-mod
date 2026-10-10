import type { Check, Note, PrInfo, PrInfoResult, Reviewer, Thread } from '../types'
import { DRACULA } from './palette'
import { parseBody, type Segment } from './pr-body'
import { ago } from './pr-data'

type El = any
type Table = any

export type PaneView = {
  t: Table
  result: PrInfoResult | null
  isLoading: boolean
  toggled: string[]
  onToggle: (id: string) => void
  onRefresh: () => void
  onOpenWeb: () => void
  onClose: () => void
}

type Ctx = PaneView & { isOpen: (id: string, byDefault: boolean) => boolean; now: number }

const STATE_COLOR: Record<string, string> = {
  OPEN: DRACULA.green,
  MERGED: DRACULA.purple,
  CLOSED: DRACULA.red,
}

const MERGE_STATE: Record<string, [string, string]> = {
  CLEAN: ['ready to merge', DRACULA.green],
  BLOCKED: ['blocked', DRACULA.yellow],
  BEHIND: ['behind base', DRACULA.yellow],
  DIRTY: ['conflicts', DRACULA.red],
  UNSTABLE: ['unstable checks', DRACULA.orange],
  HAS_HOOKS: ['ready (hooks)', DRACULA.green],
}

const REVIEW: Record<string, [string, string, string]> = {
  APPROVED: ['✓', 'approved', DRACULA.green],
  CHANGES_REQUESTED: ['✗', 'changes requested', DRACULA.red],
  COMMENTED: ['●', 'commented', DRACULA.cyan],
  DISMISSED: ['○', 'dismissed', DRACULA.comment],
  PENDING: ['○', 'pending', DRACULA.yellow],
}

const DECISION: Record<string, [string, string]> = {
  APPROVED: ['approved', DRACULA.green],
  CHANGES_REQUESTED: ['changes requested', DRACULA.red],
  REVIEW_REQUIRED: ['review required', DRACULA.yellow],
}

const CHECK: Record<Check['state'], [string, string]> = {
  fail: ['✗', DRACULA.red],
  pending: ['●', DRACULA.yellow],
  pass: ['✓', DRACULA.green],
  skip: ['○', DRACULA.comment],
}

function heading(c: Ctx, key: string, title: string, extra?: El) {
  const { Box, Text } = c.t
  return (
    <Box key={`h:${key}`} marginTop={1}>
      <Text>
        <Text bold color={DRACULA.purple}>{title}</Text>
        {extra}
      </Text>
    </Box>
  )
}

function toggle(c: Ctx, id: string, isOpen: boolean, children: El[]) {
  const { Button, Text } = c.t
  return (
    <Button key={`toggle:${id}`} plain onPress={() => c.onToggle(id)}>
      <Text color={DRACULA.pink}>{isOpen ? '▾ ' : '▸ '}</Text>
      {children}
    </Button>
  )
}

function segments(c: Ctx, list: Segment[], idBase: string): El[] {
  const { Box, Markdown, Text } = c.t
  return list.map((s, i) => {
    const id = `${idBase}.${i}`
    if (s.kind === 'md') return <Markdown key={`md:${id}`} text={s.text} />
    const isOpen = c.isOpen(id, false)
    return (
      <Box key={`details:${id}`} flexDirection="column">
        {toggle(c, id, isOpen, [<Text key="s">{s.summary}</Text>])}
        {isOpen && (
          <Box flexDirection="column" paddingLeft={2}>
            {segments(c, s.children, id)}
          </Box>
        )}
      </Box>
    )
  })
}

function body(c: Ctx, text: string, idBase: string): El {
  const { Box, Text } = c.t
  const list = parseBody(text)
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {list.length ? segments(c, list, idBase) : <Text color={DRACULA.comment}>(empty)</Text>}
    </Box>
  )
}

function header(c: Ctx, pr: PrInfo) {
  const { Box, Text } = c.t
  const merge = MERGE_STATE[pr.mergeState]
  return (
    <Box key="header" flexDirection="column" marginTop={1}>
      <Text>
        <Text color={DRACULA.purple}>{`#${pr.number} `}</Text>
        <Text bold>{pr.title}</Text>
      </Text>
      <Text>
        <Text color={STATE_COLOR[pr.state] ?? DRACULA.foreground}>{pr.state.toLowerCase()}</Text>
        {pr.isDraft && <Text color={DRACULA.comment}> · draft</Text>}
        {merge && pr.state === 'OPEN' && <Text color={merge[1]}>{` · ${merge[0]}`}</Text>}
        <Text color={DRACULA.cyan}>{` · @${pr.author}`}</Text>
      </Text>
      <Text>
        <Text color={DRACULA.green}>{pr.head}</Text>
        <Text color={DRACULA.comment}> → </Text>
        <Text color={DRACULA.green}>{pr.base}</Text>
      </Text>
      <Text>
        <Text color={DRACULA.green}>{`+${pr.additions} `}</Text>
        <Text color={DRACULA.red}>{`−${pr.deletions}`}</Text>
        <Text color={DRACULA.comment}>{` · ${pr.changedFiles} files`}</Text>
        {pr.labels.length > 0 && <Text color={DRACULA.orange}>{` · ${pr.labels.join(', ')}`}</Text>}
      </Text>
    </Box>
  )
}

function checkRow(c: Ctx, check: Check, i: number) {
  const { Box, Link, Text } = c.t
  const [mark, color] = CHECK[check.state]
  return (
    <Box key={`check:${i}`} flexDirection="row">
      <Box flexShrink={0}><Text color={color}>{`${mark} `}</Text></Box>
      <Box flexShrink={1}>
        {check.url ? <Link href={check.url}><Text>{check.name}</Text></Link> : <Text>{check.name}</Text>}
      </Box>
    </Box>
  )
}

function checks(c: Ctx, pr: PrInfo) {
  const { Box, Text } = c.t
  if (pr.checks.length === 0) return [heading(c, 'checks', 'Checks', <Text color={DRACULA.comment}> · none</Text>)]
  const count = (s: Check['state']) => pr.checks.filter(x => x.state === s).length
  const summary = (['fail', 'pending', 'pass', 'skip'] as const)
    .filter(s => count(s) > 0)
    .map(s => <Text key={s} color={CHECK[s][1]}>{`  ${CHECK[s][0]} ${count(s)}`}</Text>)
  const loud = pr.checks.map((x, i) => [x, i] as const).filter(([x]) => x.state === 'fail' || x.state === 'pending')
  const quiet = pr.checks.map((x, i) => [x, i] as const).filter(([x]) => x.state === 'pass' || x.state === 'skip')
  const id = `${pr.number}:checks`
  const isOpen = c.isOpen(id, false)
  return [
    heading(c, 'checks', 'Checks', summary),
    <Box key="checks" flexDirection="column" paddingLeft={2}>
      {loud.map(([x, i]) => checkRow(c, x, i))}
      {quiet.length > 0 && toggle(c, id, isOpen, [<Text key="q" color={DRACULA.comment}>{`${quiet.length} passed or skipped`}</Text>])}
      {isOpen && quiet.map(([x, i]) => checkRow(c, x, i))}
    </Box>,
  ]
}

function reviewerRow(c: Ctx, r: Reviewer) {
  const { Text } = c.t
  const [mark, word, color] = REVIEW[r.state] ?? ['●', r.state.toLowerCase(), DRACULA.comment]
  return (
    <Text key={`reviewer:${r.login}`}>
      <Text color={color}>{`${mark} `}</Text>
      <Text color={DRACULA.cyan}>{`@${r.login}`}</Text>
      <Text color={DRACULA.comment}>{` ${word}`}</Text>
    </Text>
  )
}

function reviews(c: Ctx, pr: PrInfo) {
  const { Box, Text } = c.t
  const decision = pr.reviewDecision ? DECISION[pr.reviewDecision] : undefined
  return [
    heading(c, 'reviews', 'Reviews', decision && <Text color={decision[1]}>{` · ${decision[0]}`}</Text>),
    <Box key="reviews" flexDirection="column" paddingLeft={2}>
      {pr.reviewers.length ? pr.reviewers.map(r => reviewerRow(c, r)) : <Text color={DRACULA.comment}>No reviewers yet.</Text>}
    </Box>,
  ]
}

function noteHeader(c: Ctx, author: string, at: string, extra?: El, prefix = '') {
  const { Text } = c.t
  return (
    <Text>
      {prefix && <Text color={DRACULA.comment}>{prefix}</Text>}
      <Text bold color={DRACULA.cyan}>{`@${author}`}</Text>
      <Text color={DRACULA.comment}>{` · ${ago(at, c.now)}`}</Text>
      {extra}
    </Text>
  )
}

function note(c: Ctx, n: Note) {
  const { Box, Text } = c.t
  const review = n.review ? REVIEW[n.review] : undefined
  const extra = review && <Text color={review[2]}>{` · ${review[1]}`}</Text>
  if (n.hidden) {
    return (
      <Box key={`note:${n.id}`} flexDirection="column" marginTop={1}>
        {noteHeader(c, n.author, n.at, <Text color={DRACULA.comment}>{` · hidden (${n.hidden})`}</Text>)}
      </Box>
    )
  }
  return (
    <Box key={`note:${n.id}`} flexDirection="column" marginTop={1}>
      {noteHeader(c, n.author, n.at, extra)}
      {n.body.trim() ? body(c, n.body, `note:${n.id}`) : null}
    </Box>
  )
}

function conversation(c: Ctx, pr: PrInfo) {
  const { Box, Text } = c.t
  return [
    heading(c, 'conversation', 'Conversation', <Text color={DRACULA.comment}>{` · ${pr.notes.length}`}</Text>),
    <Box key="conversation" flexDirection="column" paddingLeft={2}>
      {pr.notes.length ? pr.notes.map(n => note(c, n)) : <Text color={DRACULA.comment}>No comments yet.</Text>}
    </Box>,
  ]
}

function thread(c: Ctx, t: Thread) {
  const { Box, Text } = c.t
  const id = `thread:${t.id}`
  const isOpen = c.isOpen(id, !t.isResolved)
  const where = t.line ? `${t.path}:${t.line}` : t.path
  const tags = [t.isResolved && 'resolved', t.isOutdated && 'outdated'].filter(Boolean).join(' · ')
  return (
    <Box key={id} flexDirection="column" marginTop={1}>
      {toggle(c, id, isOpen, [
        <Text key="w" color={t.isResolved ? DRACULA.comment : DRACULA.yellow}>{where}</Text>,
        <Text key="t" color={DRACULA.comment}>{tags ? ` · ${tags}` : ''}</Text>,
        <Text key="n" color={DRACULA.comment}>{` · ${t.comments.length}`}</Text>,
      ])}
      {isOpen &&
        t.comments.map((cm, i) => (
          <Box key={`comment:${cm.id}`} flexDirection="column" paddingLeft={2} marginTop={i ? 1 : 0}>
            {noteHeader(c, cm.author, cm.at, undefined, i ? '↳ ' : '')}
            {body(c, cm.body, `comment:${cm.id}`)}
          </Box>
        ))}
    </Box>
  )
}

function threads(c: Ctx, pr: PrInfo) {
  const { Box, Text } = c.t
  const open = pr.threads.filter(t => !t.isResolved).length
  return [
    heading(c, 'threads', 'Code comments', <Text color={DRACULA.comment}>{` · ${open} open / ${pr.threads.length}`}</Text>),
    <Box key="threads" flexDirection="column" paddingLeft={2}>
      {pr.threads.length ? pr.threads.map(t => thread(c, t)) : <Text color={DRACULA.comment}>No code comments.</Text>}
    </Box>,
  ]
}

function toolbar(c: Ctx, canOpenWeb: boolean) {
  const { Box, Button, Text } = c.t
  return (
    <Box key="toolbar" flexDirection="row" columnGap={2} flexWrap="wrap">
      <Button key="refresh" plain hotkey="r" label="Refresh" onPress={c.onRefresh} />
      {canOpenWeb && <Button key="web" plain hotkey="o" label="Open on GitHub" onPress={c.onOpenWeb} />}
      <Button key="close" plain hotkey="x" label="Close" role="dismiss" onPress={c.onClose} />
      {c.isLoading && <Text color={DRACULA.comment}>loading…</Text>}
    </Box>
  )
}

export function renderPane(view: PaneView): El {
  const { Box, Text } = view.t
  const flipped = new Set(view.toggled)
  const now = view.result?.status === 'ready' ? view.result.fetchedAt : 0
  const c: Ctx = { ...view, now, isOpen: (id, byDefault) => byDefault !== flipped.has(id) }

  if (!view.result) {
    return (
      <Box flexDirection="column">
        {toolbar(c, false)}
        <Text color={DRACULA.comment}>Loading pull request…</Text>
      </Box>
    )
  }
  if (view.result.status === 'none') {
    return (
      <Box flexDirection="column">
        {toolbar(c, false)}
        <Box marginTop={1}><Text color={DRACULA.comment}>{view.result.message}</Text></Box>
      </Box>
    )
  }
  const pr = view.result.info
  return (
    <Box flexDirection="column">
      {toolbar(c, true)}
      {header(c, pr)}
      {checks(c, pr)}
      {reviews(c, pr)}
      {heading(c, 'description', 'Description')}
      {body(c, pr.body, `${pr.number}:body`)}
      {conversation(c, pr)}
      {threads(c, pr)}
    </Box>
  )
}
