# clps-claude-code-mod

Dracula theme for the Claude Code terminal UI, forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes):

- Your prompts and Claude's replies drawn in padded, coloured boxes
- Reply markdown in Dracula colours (headings, `inline code`, **bold**, links, bullets, quotes)
- A band above the prompt with the current branch's pull request: number, title and author (needs `gh`; refreshed at session start and after each turn)

Code blocks and tables keep Claude Code's own rendering. While a reply streams, Claude Code draws it with its own view; it moves into the box when the block finishes.

## Install

```
/plugin marketplace add streetclips/clps-claude-code-mod
/plugin install clps-claude-code-mod@clps-claude-code-mod
```

## Colours

Edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`, then follow "Shipping a change" in `CLAUDE.md`.
