---
name: dev-setup
description: Initialize a new project or align an existing one with the owner's baseline — README.md for humans, AGENTS.md for agents with CLAUDE.md as a one-line pointer, a wiki/ knowledge base holding specs and plans, MIT LICENSE, a stack-matched .gitignore, and oxfmt + oxlint for TypeScript projects. Use when the user asks to set up, initialize, scaffold, or bootstrap a project, e.g. "set up this project", "初始化项目", "按我的规范调整这个项目".
---

# dev-setup

Bring a project to the owner's baseline — bootstrap a new one, or align an existing one. The baseline is deliberately small: documents with a strict audience split, one knowledge base, and a minimal quality floor. Projects are maintained by agents; humans use them and make decisions. Every artifact below exists for exactly one of those two audiences.

## The baseline

1. **README.md — for humans.** What the project is, why it exists, and how to use it. Written for the person who uses the project and makes decisions about it — not a contributor guide, and never a duplicate of agent-facing conventions.

2. **AGENTS.md — for agents.** Exactly the knowledge an agent needs to maintain the project that cannot be recovered by reading the code: conventions, constraints, and decisions with their reasons. Never restate what the code already shows — a fact visible in the code does not belong here.

3. **CLAUDE.md — a pointer.** One line telling the agent to read `AGENTS.md`. Nothing else.

4. **wiki/ — the project knowledge base.** All project-level knowledge — specs, plans, research, decisions — sediments under `wiki/`. Initialize it with only a `wiki/README.md` index describing this convention; subdirectories appear on demand. Plans written by `dev-write-plan` live under `wiki/plans/`.

5. **LICENSE.** MIT by default. An existing license stays.

6. **.gitignore.** Generated for the project's actual stack, not a kitchen-sink template.

7. **Format and lint.** TypeScript projects use oxfmt and oxlint with minimal configuration and `fmt`/`lint` package scripts. Consult the tools' current documentation instead of writing config from memory. Other stacks get the community-standard minimal equivalent.

## New project

1. `git init` if there is no repository yet.
2. Create the baseline artifacts with real minimal content — no placeholder text, no empty section scaffolds written "for later".
3. Leave committing to the user unless asked.

## Existing project

1. Audit the project against the baseline and report three lists: present, missing, conflicting.
2. Create what is missing.
3. Migrate, don't duplicate — knowledge lives in exactly one place:
   - a root `plans/` directory moves into `wiki/plans/`, with references updated;
   - agent-facing conventions found in `README.md` move to `AGENTS.md`;
   - content in `AGENTS.md` that merely restates the code is deleted.
4. Working tooling that conflicts with the baseline (e.g. ESLint/Prettier already configured) is proposed as a swap, never silently replaced.
5. Report what changed and what was deliberately left alone.
