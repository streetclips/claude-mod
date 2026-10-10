# clps-claude-code-mod

Dracula theme for the Claude Code terminal UI, forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes):

- Your prompts and Claude's replies drawn in padded, coloured boxes
- Reply markdown in Dracula colours (headings, `inline code`, **bold**, links, bullets, quotes)
- `/pr-info` toggles a sidebar with the whole pull request: state, checks, reviewers, description, conversation and code comment threads with their replies. `<details>` blocks and resolved threads fold; `r` refreshes, `o` opens it on GitHub, `x` closes it (needs `gh`; docks beside the transcript in fullscreen from 110 columns)

Code blocks and tables keep Claude Code's own rendering. While a reply streams, Claude Code draws it with its own view; it moves into the box when the block finishes.

## Install

```
/plugin marketplace add streetclips/clps-claude-code-mod
/plugin install clps-claude-code-mod@clps-claude-code-mod
```

## Colours

Edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`, then follow "Shipping a change" in `CLAUDE.md`.
