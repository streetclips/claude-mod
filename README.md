# clps-claude-code-mod

Dracula theme for the Claude Code terminal UI, forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes):

- Your prompts and Claude's replies drawn in padded, coloured boxes
- Reply markdown in Dracula colours (headings, `inline code`, **bold**, links, bullets, quotes)
- Turn footer with duration, tokens, cost, context change, tools and file changes
- Narrator, adapted from [midudev/better-claude](https://github.com/midudev/better-claude/tree/main/plugins/narrator): after each turn Claude tells you out loud what it did, in your language, with the best free voice your system has (Siri's on macOS, OneCore on Windows, speech-dispatcher or espeak-ng on Linux). Switch it with `⏸︎ narrator off` at the right of the prompt footer or `/narrator [on | off | stop]`; a new prompt cuts it short, and it stays as you left it in later sessions

Code blocks and tables keep Claude Code's own rendering. While a reply streams, Claude Code draws it with its own view; it moves into the box when the block finishes.

## Install

```
/plugin marketplace add streetclips/clps-claude-code-mod
/plugin install clps-claude-code-mod@clps-claude-code-mod
```

## Narrator settings

In `/config`:

- **Narrator voice**: a voice name (`Mónica`, `Microsoft Helena`) to always speak with. Empty: the best one for the language.
- **Model that writes the narration**: `haiku` by default.

For better voices on macOS, download a Siri or Premium voice in System Settings → Accessibility → Spoken Content → System voice → Manage Voices.

## Colours

Edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`, then follow "Shipping a change" in `CLAUDE.md`.
