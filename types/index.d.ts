export type PullRequest = { number: number; title: string; author: string; state: string }

export type CheckState = 'pass' | 'fail' | 'pending' | 'skip'
export type Check = { name: string; state: CheckState; url: string | null }
export type Reviewer = { login: string; state: string }
export type Note = { id: string; author: string; body: string; at: string; review: string | null; hidden: string | null }
export type ThreadComment = { id: string; author: string; body: string; at: string }
export type Thread = {
  id: string
  path: string
  line: number | null
  isResolved: boolean
  isOutdated: boolean
  comments: ThreadComment[]
}
export type PrInfo = {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  author: string
  head: string
  base: string
  reviewDecision: string | null
  mergeState: string
  additions: number
  deletions: number
  changedFiles: number
  labels: string[]
  body: string
  reviewers: Reviewer[]
  checks: Check[]
  notes: Note[]
  threads: Thread[]
}
export type PrInfoResult = { status: 'ready'; info: PrInfo; fetchedAt: number } | { status: 'none'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'clps-claude-code-mod': {
      pr: PullRequest | null
      info: PrInfoResult | null
      isLoading: boolean
      toggled: string[]
    }
  }
}
