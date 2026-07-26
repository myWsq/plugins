---
name: arch-monorepo
description: The owner's monorepo decision framework plus repository baseline — default to one monorepo per context (pnpm + turborepo, packages/ + apps/, changesets fixed versioning), and align the repo with the baseline: README.md for humans, AGENTS.md for agents with CLAUDE.md as a one-line pointer, a wiki/ knowledge base, MIT LICENSE, a stack-matched .gitignore, oxfmt + oxlint for TypeScript, and .agents/skills as the real project-skills directory with .claude/skills symlinked to it. Use when setting up, initializing, or aligning a repository ("set up this project", "初始化项目", "按我的规范调整这个项目") or when deciding repository structure and tooling ("该不该用 monorepo", "monorepo 选型", "怎么组织这个仓库").
---

# arch-monorepo

The owner's settled judgment on repository structure, in two parts: a **decision
framework** — how to choose, with the reasons, so defaults can be overridden for
cause — and a **repository baseline** — how to land the choice. Defaults here are
defaults with reasons, not inviolable rules: follow them unless a concrete reason
says otherwise, and say so when you deviate.

## Decision framework

### Default to a monorepo

Projects that share one context belong in one repository. The deciding cost is
agent maintenance: an agent maintaining related projects in a single repo needs no
context switching between checkouts, and cross-project changes stay one commit.
So the default is: put it in the monorepo.

No exception has been encountered yet. When one appears, record it here — do not
invent exception lists ahead of the evidence.

### Toolchain: pnpm + turborepo

The clearest mental model of the available options, with no feature gaps in
practice. No alternative has proven better in real use. Do not swap the toolchain
without a concrete failure of this one.

### Layout: `packages/` and `apps/`

- `packages/` — dependable packages: libraries and tools that other workspace
  members or external consumers import. Whether a package is published or
  internal-only is a `package.json` `private` field decision, not a directory
  decision.
- `apps/` — applications: web apps, mobile apps, and other deployable end
  products.

No third top-level workspace directory. The two-way split keeps the semantics
obvious: `packages/` is depended on, `apps/` depends.

### Versioning: changesets, fixed mode

Every package in the repository shares one version number, released with
[changesets](https://github.com/changesets/changesets) in fixed mode. One repo,
one version — nobody reconstructs which combination of package versions belongs
together.

## Repository baseline

The baseline is deliberately small: documents with a strict audience split, one
knowledge base, and a minimal quality floor. Projects are maintained by agents;
humans use them and make decisions. Every artifact exists for exactly one of
those two audiences.

1. **README.md — for humans.** What the project is, why it exists, and how to use
   it. Written for the person who uses the project and makes decisions about it —
   not a contributor guide, and never a duplicate of agent-facing conventions.

2. **AGENTS.md — for agents.** Exactly the knowledge an agent needs to maintain
   the project that cannot be recovered by reading the code: conventions,
   constraints, and decisions with their reasons. Never restate what the code
   already shows.

3. **CLAUDE.md — a pointer.** One line telling the agent to read `AGENTS.md`.
   Nothing else.

4. **wiki/ — the project knowledge base.** All project-level knowledge — specs,
   plans, research, decisions — sediments under `wiki/`. Initialize it with only a
   `wiki/README.md` index describing this convention; subdirectories appear on
   demand. Implementation plans live under `wiki/plans/`.

5. **Project skills — one source, two entries.** `.agents/skills/` is the real
   directory for project-local agent skills; `.claude/skills` is a symlink to it.
   Same logic as AGENTS.md vs CLAUDE.md: the neutral location is the source, the
   vendor location is an entry point.

6. **LICENSE.** MIT by default. An existing license stays.

7. **.gitignore.** Generated for the project's actual stack, not a kitchen-sink
   template.

8. **Format and lint.** TypeScript projects use oxfmt and oxlint with minimal
   configuration and `fmt`/`lint` package scripts. Consult the tools' current
   documentation instead of writing config from memory. Other stacks get the
   community-standard minimal equivalent.

## New project

1. `git init` if there is no repository yet.
2. Apply the decision framework: pnpm workspace with turborepo, `packages/` and
   `apps/`, changesets in fixed mode.
3. Create the baseline artifacts with real minimal content — no placeholder text,
   no empty section scaffolds written "for later".
4. Leave committing to the user unless asked.

## Existing project

1. Audit the project against the framework and baseline; report three lists:
   present, missing, conflicting.
2. Create what is missing.
3. Migrate, don't duplicate — knowledge lives in exactly one place:
   - a root `plans/` directory moves into `wiki/plans/`, with references updated;
   - agent-facing conventions found in `README.md` move to `AGENTS.md`;
   - content in `AGENTS.md` that merely restates the code is deleted;
   - skills found under `.claude/skills/` as real files move to `.agents/skills/`,
     with the symlink left in their place.
4. Working tooling that conflicts with the framework (another package manager,
   task runner, or ESLint/Prettier already configured) is proposed as a swap,
   never silently replaced.
5. Report what changed and what was deliberately left alone.
