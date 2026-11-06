# claude-mod

A [Dracula](https://draculatheme.com)-coloured interface for Claude Code: your prompts and Claude's replies in padded boxes, markdown in theme colours, clickable file paths, a turn footer with tokens and diff stats, and an optional narrator that reads each turn out loud.

By [Alejandro Cantero](https://alejandrocantero.dev). Forked from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes); the narrator is adapted from [midudev/better-claude](https://github.com/midudev/better-claude/tree/main/plugins/narrator).

```
╭──────────────────────────────────────────────────────────╮
│  refactor the auth middleware and run the tests          │   ← your prompt
╰──────────────────────────────────────────────────────────╯

╭──────────────────────────────────────────────────────────╮
│  ## Done                                                │
│                                                          │
│  Moved the check into `src/auth/middleware.ts:42` and    │   ← Claude's reply
│  added a case for expired tokens.                        │
│                                                          │
│    • 12 tests pass                                       │
╰──────────────────────────────────────────────────────────╯
  14:32 · 1m 08s · ↑12.4k ↓1.8k · ctx +2.1k · 6 tools · 2 files +48 -11
```

## Install

Inside Claude Code:

```
/plugin marketplace add streetclips/claude-mod
/plugin install alejandrocantero-claude-mod@claude-mod
```

Then `/reload-plugins`. If the boxes do not change, restart Claude Code.

## What it does

1. **Prompt and reply boxes.** Every message you send and every reply Claude writes is drawn in its own padded, coloured box.
2. **Themed markdown.** Headings, `inline code`, **bold**, links, bullets and quotes each get a Dracula colour. Code blocks and tables keep Claude Code's own rendering.
3. **Clickable paths.** Files and folders named in a reply (`hooks/markdown.tsx:36`, `src/util.ts`, `~/.config/ttt`) open with a click: text files in [ttt](https://tttedit.dev) at that line, everything else with the system's `open`. A bare filename is resolved in the workspace, `node_modules` and `vendor` aside, and opens when only one file can be meant. Requires `"tui": "fullscreen"`.
4. **Turn footer.** Finish time, duration, input and output tokens, context change, tool count, and files changed with added and removed lines.
5. **Narrator.** After each turn, Claude says out loud what it did, in the language it answered in, with the best free voice installed (Siri on macOS, OneCore on Windows, speech-dispatcher or espeak-ng on Linux). Toggle it with the `⏸ narrator off` button in the prompt footer or with `/narrator [on | off | stop]`. The setting survives across sessions.

## Configuration

In `/config`:

1. **Narrator voice**: a voice name (`Mónica`, `Microsoft Helena`) to always speak with. Empty picks the best voice for the language.
2. **Model that writes the narration**: `haiku` by default.

For better voices on macOS, download a Siri or Premium voice in System Settings → Accessibility → Spoken Content → System voice → Manage Voices.

## How it works

A plugin is a set of modules that hook into Claude Code's render and lifecycle events. This one registers a single module, `hooks/register.tsx`, which wires the rest:

```
hooks/hooks.json
      │
      └── register.tsx ──── ui.render UserMessage ──────► box around your prompt
                    │
                    ├──── ui.render AssistantMessage ───► box + markdown + file links
                    │                                     (paths looked up after the box)
                    ├──── turn.start / tool.call ───────► turn-stats.tsx → footer
                    ├──── turn.complete ────────────────► narrator.tsx → speech
                    └──── session.start ────────────────► registers /narrator
```

| File | Role |
|---|---|
| `hooks/register.tsx` | Entry point: renders both boxes and wires the other modules |
| `hooks/markdown.tsx` | Markdown renderer and its colour map |
| `hooks/file-links.ts` | Finds the paths a reply names and resolves bare filenames |
| `hooks/open-file.ts` | Opens a path in ttt, a herdr tab, or with `open` |
| `hooks/turn-stats.tsx` | Collects per-turn usage and renders the footer |
| `hooks/narrator.tsx` | `/narrator` command, toggle button and speech |
| `hooks/narrator-speaker.ts` | Picks a synthesizer per platform |
| `hooks/narrator-text.ts` | Cuts the narration and strips it to plain text |
| `hooks/palette.ts` | The Dracula palette |
| `types/index.d.ts` | The plugin's state contract |

## Development

```
claude --plugin-dir .      # try the working copy without installing it
claude plugin validate .   # manifest and hook checks
claude plugin test .       # 49 tests
```

To change the colours, edit `PROMPT_BG` and `REPLY_BG` in `hooks/register.tsx` and `MD` in `hooks/markdown.tsx`. To ship a change, follow `CLAUDE.md`.

## Opening files in ttt

A click opens the file in the ttt already running when ttt can take files from outside (`--new-window` in `ttt --help`, not in a release up to 1.9.0) and `"reuseWindow": true` is set in its `settings.json` (`~/.config/ttt/`); until then each click opens a new herdr tab. Outside herdr, or without ttt installed, every click falls back to `open`.

## License

MIT. See [LICENSE](LICENSE).
