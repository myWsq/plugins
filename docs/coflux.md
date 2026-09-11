# coflux

`coflux` connects Claude Code to the owner's coflux agent command center: a
per-machine daemon runs the PTYs that host agent sessions, and a web client
shows every workspace with its live turn state so a human can supervise many
parallel agents and take over at any time.

The plugin is maintained upstream in
[`myWsq/coflux`](https://github.com/myWsq/coflux) under
`integrations/claude-plugin`; this marketplace collects that directory at a
pinned commit.

## Components

- **Hooks** — wire `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, and
  `Notification` to the `cofluxd hook claude` messenger, which forwards the
  event to the local daemon. The daemon maps events to turn states —
  active / approval / question / done — shown live in the coflux sidebar.
  Inside a coflux session a few more hooks act. `SessionStart` asks the
  daemon to locate the session's directory, then prints the session's coflux
  coordinates (so resuming a session that had entered a worktree lands back
  in it). `UserPromptSubmit` prints a `<coflux-session-moved>` block when the
  working directory sits in a different coflux workspace than the terminal
  does. `PostToolUse` on `EnterWorktree|ExitWorktree` and `WorktreeRemove`
  follow the agent into git worktrees: the terminal's owning workspace moves
  with it, an unknown worktree is registered as a child workspace first, and
  on removal the terminals move back to the main workspace. A `PreToolUse`
  guard steers `git worktree remove|move` to the coflux MCP workspace tools;
  creating a worktree is not intercepted since coflux follows the agent into
  it. The plugin never intercepts the agent's own Bash calls otherwise.
- **`coflux` skill** — documents, for an agent running inside a coflux
  terminal, the terminals the user can see and take over (a job terminal that
  runs one command to completion with an exit code, or a session terminal: a
  persistent login shell on a real tty, opened by passing no command), the
  progress and notify channels, preview URLs, and when each is worth using. One rule: anything that closes
  locally uses the zero-credential local commands
  (`cofluxd terminal/progress/notify/ports`); only crossing workspace or
  device boundaries goes through the center's `coflux` MCP.
- **`.mcp.json`** — declares the center's `coflux` MCP server (Streamable HTTP
  + OAuth 2.1) at the public URL `https://api.coflux.dev/mcp`, hard-coded so
  that hosts which do not expand `${VAR}` in `.mcp.json` still parse it. For
  a self-hosted center add a server by hand from the `COFLUX_MCP_URL` the
  daemon injects: `claude mcp add --transport http coflux "$COFLUX_MCP_URL"`. The
  per-call `timeout` is 660 s to cover `wait_terminal`'s 600 s ceiling.

## Behavior and privacy

- Hooks forward only the event name, notification type, agent session id,
  in-flight background task count, and messenger pid. Prompts, replies, and
  notification bodies never leave the machine.
- The hooks never disturb the agent: every failure — daemon down, port
  closed, or `cofluxd` not installed at all — is a silent exit 0 with no
  stdout.
- Local commands and states apply only to sessions started inside coflux; the
  daemon resolves the calling pid against its own PTY process trees. MCP
  access is scoped to the authorizing account.

## Requirements

- The [`cofluxd`](https://www.npmjs.com/package/cofluxd) CLI installed
  globally (`npm i -g cofluxd`) and the daemon registered (`cofluxd up`).
  Without it the hooks are silent no-ops and local commands are unavailable.
- One OAuth authorization for the MCP server: Claude Code does not open the
  browser by itself — pick `coflux` in the `/mcp` menu and choose
  Authenticate; tokens refresh automatically afterwards.
- `COFLUX_*` variables appear in sessions only after the machine's daemon has
  been upgraded (`cofluxd update && cofluxd restart`).

## Migrating from manual hook configuration

If you previously wired `cofluxd hook claude` (or a dev-checkout
`cofluxd.mjs hook claude`) by hand in `~/.claude/settings.json`, remove those
`hooks` entries after installing this plugin. Otherwise every event fires
twice; the merged state stays correct, but the cost is pure waste.

## Example prompts

```text
Run the test suite in a coflux terminal so I can watch it and take over.
Open a session terminal in this workspace that I can step into later.
Use coflux to check why the coflux daemon looks offline.
```

## License

MIT
