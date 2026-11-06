# claude-mod

Claude Code plugin that draws prompts and replies in Dracula-coloured boxes. Claude Code installs it from the GitHub marketplace `alejandrocantero/claude-mod`, so a change reaches Claude Code only after it is pushed.

## Shipping a change

1. Bump `version` in `.claude-plugin/plugin.json` (patch for colour tweaks, minor for behaviour). Claude Code caches each install under `plugins/cache/claude-mod/dracula-mod/<version>/`, so an unchanged version keeps serving the old code.
2. Run `claude plugin validate .` and `claude plugin test .`; both pass before committing. The warnings about the missing `author`, the root `CLAUDE.md` and the name reading as one of Anthropic's own are expected.
3. Commit and `git push`.
4. Tell the user to run, inside Claude Code (the marketplace update installs the bumped version itself):
   ```
   /plugin marketplace update claude-mod
   /reload-plugins
   ```
   If the boxes still show the old look, restart Claude Code.

To try a change before pushing, run `claude --plugin-dir .` from the repo root.
