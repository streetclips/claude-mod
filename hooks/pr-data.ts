import type { Check, CheckState, Note, PrInfo, Reviewer, Thread } from '../types'

export const VIEW_FIELDS = [
  'number', 'title', 'url', 'state', 'isDraft', 'author', 'body', 'headRefName', 'baseRefName',
  'reviewDecision', 'mergeStateStatus', 'additions', 'deletions', 'changedFiles', 'labels',
  'statusCheckRollup', 'comments', 'reviews', 'latestReviews', 'reviewRequests',
].join(',')

export const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 100) { nodes { id author { login } body createdAt } }
        }
      }
    }
  }
}`

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

export const clean = (s: unknown) => String(s ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '')

export const firstLine = (s: unknown) => clean(s).trim().split('\n')[0] ?? ''

const login = (a: any) => clean(a?.login ?? a?.name ?? a?.slug ?? 'ghost').replace(/^app\//, '')

export function repoOf(url: string) {
  const m = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/\d+/)
  return m ? { host: m[1] ?? '', owner: m[2] ?? '', name: m[3] ?? '' } : null
}

export function threadsArgv(url: string, number: number): string[] | null {
  const repo = repoOf(url)
  if (!repo) return null
  return [
    'gh', 'api', 'graphql',
    ...(repo.host === 'github.com' ? [] : ['--hostname', repo.host]),
    '-f', `owner=${repo.owner}`, '-f', `name=${repo.name}`, '-F', `number=${number}`,
    '-f', `query=${THREADS_QUERY}`,
  ]
}

function checkState(c: any): CheckState {
  if (c.__typename === 'StatusContext') {
    if (c.state === 'SUCCESS') return 'pass'
    return c.state === 'FAILURE' || c.state === 'ERROR' ? 'fail' : 'pending'
  }
  if (c.status !== 'COMPLETED') return 'pending'
  if (c.conclusion === 'SUCCESS') return 'pass'
  return ['NEUTRAL', 'SKIPPED', 'STALE'].includes(c.conclusion) ? 'skip' : 'fail'
}

export function toInfo(raw: any, threadsRaw: any): PrInfo {
  const author = login(raw.author)
  const checks: Check[] = (raw.statusCheckRollup ?? []).map((c: any) => ({
    name: clean(c.name ?? c.context ?? 'check'),
    state: checkState(c),
    url: c.detailsUrl || c.targetUrl || null,
  }))

  const byLogin = new Map<string, Reviewer>()
  for (const r of raw.latestReviews ?? []) byLogin.set(login(r.author), { login: login(r.author), state: r.state })
  for (const r of raw.reviewRequests ?? []) byLogin.set(login(r), { login: login(r), state: 'PENDING' })
  byLogin.delete(author)

  const notes: Note[] = [
    ...(raw.comments ?? []).map((c: any): Note => ({
      id: c.id,
      author: login(c.author),
      body: clean(c.body),
      at: c.createdAt,
      review: null,
      hidden: c.isMinimized ? clean(c.minimizedReason || 'hidden').toLowerCase() : null,
    })),
    ...(raw.reviews ?? [])
      .filter((r: any) => r.state !== 'PENDING' && (clean(r.body).trim() || r.state !== 'COMMENTED'))
      .map((r: any): Note => ({
        id: r.id,
        author: login(r.author),
        body: clean(r.body),
        at: r.submittedAt,
        review: r.state,
        hidden: null,
      })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const threads: Thread[] = (threadsRaw?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []).map((t: any) => ({
    id: t.id,
    path: clean(t.path),
    line: t.line ?? t.originalLine ?? null,
    isResolved: !!t.isResolved,
    isOutdated: !!t.isOutdated,
    comments: (t.comments?.nodes ?? []).map((c: any) => ({
      id: c.id,
      author: login(c.author),
      body: clean(c.body),
      at: c.createdAt,
    })),
  }))

  return {
    number: raw.number,
    title: clean(raw.title),
    url: raw.url,
    state: raw.state,
    isDraft: !!raw.isDraft,
    author,
    head: clean(raw.headRefName),
    base: clean(raw.baseRefName),
    reviewDecision: raw.reviewDecision || null,
    mergeState: raw.mergeStateStatus ?? 'UNKNOWN',
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changedFiles: raw.changedFiles ?? 0,
    labels: (raw.labels ?? []).map((l: any) => clean(l.name)),
    body: clean(raw.body),
    reviewers: [...byLogin.values()],
    checks,
    notes,
    threads,
  }
}

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (!Number.isFinite(s)) return ''
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d`
  return iso.slice(0, 10)
}
