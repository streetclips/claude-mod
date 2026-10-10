# ui-themes

Dracula theme for the Claude Code terminal UI, forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes):

- Your prompts and Claude's replies drawn in padded, coloured boxes
- Reply markdown in Dracula colours (headings, `inline code`, **bold**, links, bullets, quotes)

Code blocks and tables keep Claude Code's own rendering. While a reply streams, Claude Code draws it with its own view; it moves into the box when the block finishes.

## Install

```
/plugin marketplace add ~/Documents/Projects/alejandro/claude-ui-themes
/plugin install ui-themes@ui-themes
```

## Colours

Edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`, then run `/reload-plugins`.
