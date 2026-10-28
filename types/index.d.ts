export type FileChange = { added: number; removed: number }
export type TurnStats = {
  inputTokens: number
  outputTokens: number
  costUsd: number | null
  contextDelta: number | null
  tools: number
  files: Record<string, FileChange>
}

declare module 'claude-code' {
  interface PluginState {
    'clps-claude-code-mod': {
      narratorEnabled: boolean
      turns: Record<string, TurnStats>
      openDetails: StateFamily<number[]>
    }
  }
}
