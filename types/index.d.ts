export type PullRequest = { number: number; title: string; author: string; state: string }

declare module 'claude-code' {
  interface PluginState {
    'clps-claude-code-mod': { pr: PullRequest | null }
  }
}
