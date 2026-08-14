---
name: coflux
description: The owner's coflux agent command center — what it is, how this plugin reports Claude Code activity to the local daemon, and how to diagnose the daemon with the cofluxd CLI. Use when asked about coflux, when workspace activity states look wrong or stale, or when the local daemon seems offline ("coflux 状态不对", "daemon 掉线", "cofluxd 怎么排查", "why is my workspace not showing activity").
---

# coflux

coflux is the owner's self-hosted agent command center: a per-machine daemon
runs PTYs that host Claude Code / Codex sessions, and a web client shows every
workspace with its live turn state — active, waiting for approval, waiting for
input, or done — so a human can supervise many agents and take over at any
time.

## How activity reporting works

This plugin ships the Claude Code half of the reporting pipeline as hooks: on
each relevant hook event it runs `cofluxd hook claude`, a messenger that
forwards the event to the local daemon (`POST /hook` on the loopback gateway).
The daemon maps events to turn states — tool use means active,
PermissionRequest means approval, Stop means done, Notification splits by its
type — and merges the result into the workspace presence shown in the web
sidebar.

Privacy boundary: the messenger sends only the event name, the notification
type, the agent session id, and its own pid. Prompts, replies, and
notification bodies never leave the machine.

Discipline: the messenger must never disturb the agent. Every failure — daemon
down, port closed, malformed payload, or `cofluxd` not installed at all — is a
silent exit 0 with no stdout. If states look wrong, nothing will have logged an
error in the session; diagnose with the CLI below.

## Diagnosing with cofluxd

- `cofluxd status` — server, registration (including "waiting for
  authorization"), service, and connection state at a glance.
- `cofluxd doctor` — layered self-check: central network, gateway bind/grant,
  loopback WS, daemon-to-center state. A local failure only means direct
  transport degraded to relay; it does not mean the daemon is offline.
- `cofluxd logs -f` — follow the daemon log.
- `cofluxd up` — idempotent install/start; also the way to apply a hand-edited
  `~/.coflux/settings.json`.
- `COFLUX_HOOK_DEBUG=1 cofluxd hook claude` — make the otherwise-silent
  messenger print its forwarding steps to stderr.
- `cofluxd restart` — applies a new supervisor, but **kills every live session
  on the machine**. Never suggest it as a first step; prefer `status`/`doctor`
  and `up`.

Activity states only appear for sessions started inside coflux: the daemon
resolves the reporting pid against the process trees of its own PTYs, so a
Claude Code session launched elsewhere reports into the void (the messenger
still exits silently).
