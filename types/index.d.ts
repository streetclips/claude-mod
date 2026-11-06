export type FileChange = { added: number; removed: number }
export type FileRef = { path: string; kind: 'file' | 'dir'; line?: string; column?: string }
export type TurnStats = {
  inputTokens: number
  outputTokens: number
  endedAt: number
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
      fileRefs: StateFamily<{ text: string; refs: Record<string, FileRef> }>
    }
  }
}
