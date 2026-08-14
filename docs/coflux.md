# coflux

`coflux` connects Claude Code to the owner's coflux agent command center: a
per-machine daemon runs the PTYs that host agent
sessions, and a web client shows every workspace with its live turn state so a
human can supervise many parallel agents and take over at any time.

## Components

- **Hooks** (Claude Code only) — wire `PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, and
  `Notification` to the `cofluxd hook claude` messenger, which forwards the
  event to the local daemon. The daemon maps events to turn states —
  active / approval / question / done — shown live in the coflux sidebar.
- **`coflux` skill** — what coflux is, how reporting works, and how to
  diagnose the daemon with `cofluxd status`, `doctor`, and `logs`.

## Behavior and privacy

- Only the event name, notification type, agent session id, and messenger pid
  are forwarded. Prompts, replies, and notification bodies never leave the
  machine.
- The hooks never disturb the agent: every failure — daemon down, port
  closed, or `cofluxd` not installed at all — is a silent exit 0 with no
  stdout.
- States appear only for sessions started inside coflux; the daemon resolves
  the reporting pid against its own PTY process trees.

## Requirements

The [`cofluxd`](https://www.npmjs.com/package/cofluxd) CLI must be installed
globally (`npm i -g cofluxd`) and the daemon registered (`cofluxd up`).
Without it the hooks are silent no-ops.

## Migrating from manual hook configuration

If you previously wired `cofluxd hook claude` (or a dev-checkout
`cofluxd.mjs hook claude`) by hand in `~/.claude/settings.json`, remove those
`hooks` entries after installing this plugin. Otherwise every event fires
twice — two process spawns and two POSTs per event; the merged state stays
correct, but the cost is pure waste.

## Example prompts

```text
Use coflux to check why the coflux daemon looks offline.
Use coflux to explain how workspace activity states are reported.
```

## License

MIT
