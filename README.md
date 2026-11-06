# claude-mod

Dracula theme for the Claude Code terminal UI by Alejandro Cantero ([alejandrocantero.dev](https://alejandrocantero.dev)), forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes):

- Your prompts and Claude's replies drawn in padded, coloured boxes
- Reply markdown in Dracula colours (headings, `inline code`, **bold**, links, bullets, quotes)
- Files and folders a reply names (`hooks/markdown.tsx:36`, `hooks/markdown.tsx:36-48`, `~/.config/ttt`, `[readme](README.md#L3)`) open with a click: text in [ttt](https://tttedit.dev) at that line (a range opens at its first line), in the ttt already open or in a new [herdr](https://herdr.dev) tab with the session's folder as its workspace; images, video, folders and other binaries with the system's `open`. A name given without its path (`markdown.tsx:36`, `src/util.ts`) is looked up in the workspace, `node_modules` and `vendor` aside, and opens when only one file can be meant. Clicks reach the plugin only with `"tui": "fullscreen"`; headings and quotes keep an absolute `file://` link for cmd-click
- Turn footer with the time it finished, duration, tokens, context change, tools and file changes
- Narrator, adapted from [midudev/better-claude](https://github.com/midudev/better-claude/tree/main/plugins/narrator): after each turn Claude tells you out loud what it did, in your language, with the best free voice your system has (Siri's on macOS, OneCore on Windows, speech-dispatcher or espeak-ng on Linux). Switch it with `⏸︎ narrator off` at the right of the prompt footer or `/narrator [on | off | stop]`; a new prompt cuts it short, and it stays as you left it in later sessions

Code blocks and tables keep Claude Code's own rendering. While a reply streams, Claude Code draws it with its own view; it moves into the box when the block finishes.

## Install

```
/plugin marketplace add alejandrocantero/claude-mod
/plugin install dracula-mod@claude-mod
```

## Opening files in ttt

A click opens the file in the ttt already running when ttt can take files from outside (`--new-window` in `ttt --help`, not in a release up to 1.9.0) and `"reuseWindow": true` is set in its `settings.json` (`~/.config/ttt/`); until then each click opens a new herdr tab. Outside herdr, or without ttt installed, every click falls back to `open`.

## Narrator settings

In `/config`:

- **Narrator voice**: a voice name (`Mónica`, `Microsoft Helena`) to always speak with. Empty: the best one for the language.
- **Model that writes the narration**: `haiku` by default.

For better voices on macOS, download a Siri or Premium voice in System Settings → Accessibility → Spoken Content → System voice → Manage Voices.

## Colours

Edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`, then follow "Shipping a change" in `CLAUDE.md`.
