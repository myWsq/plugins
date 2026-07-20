# plugins

A personal marketplace of reusable skills, MCP integrations, and agent workflows.

## Plugins

- [`dev`](docs/dev.md) — Plan-driven software development

## Claude Code

```text
/plugin marketplace add myWsq/plugins
/plugin install <plugin-name>@plugins
```

## Codex

Enable structured questions before installing the plugin:

```bash
codex features enable default_mode_request_user_input
```

Restart Codex or open a new session after enabling the feature, then install the plugin:

```bash
codex plugin marketplace add myWsq/plugins
codex plugin add <plugin-name>@plugins
```

This repository is generated from [myWsq/plugins-builder](https://github.com/myWsq/plugins-builder).
Do not edit generated files by hand.
