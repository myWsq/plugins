# arch

`arch` is the owner's technology-selection knowledge base, sedimented as agent
skills — one skill per domain. Each skill is a decision framework, not a rigid
prescription: it records the settled defaults *with their reasons*, so an agent
can apply them directly or deviate for a stated cause. Domains grow over time;
new frameworks land as sibling skills after the judgment behind them has been
interviewed out and written down.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `arch-monorepo` | Repository structure: default to one monorepo per context (pnpm + turborepo, `packages/` + `apps/`, changesets fixed versioning) plus the repository baseline — README.md for humans, AGENTS.md for agents with CLAUDE.md as a one-line pointer, a `wiki/` knowledge base, MIT LICENSE, a stack-matched .gitignore, oxfmt + oxlint for TypeScript, and `.agents/skills/` as the real project-skills directory with `.claude/skills` symlinked to it. | A repository set up or aligned with the framework, with a report of what changed and what was deliberately left alone. |
| `arch-web` | Frontend web development: React 19 with the React Compiler, SPA-first (SSR only when explicitly required), Vite, TanStack Router, the [astryx](https://github.com/facebook/astryx) design system with StyleX for styling, jotai for cross-page client state, TanStack Query wrapped in custom hooks for request state, no test code (manual acceptance by a human or an agent), and deployment decided per project. | A web stack chosen or aligned with the framework, deviations argued for a stated cause. |

## The framework stance

Two kinds of content live in each skill:

- **Decisions with reasons** — e.g. "default to a monorepo, because agents
  maintaining related projects in one repo never pay context-switching cost".
  The reason travels with the rule so the rule can be overridden intelligently.
- **Recorded absences** — e.g. "no monorepo exception has been encountered yet".
  Exceptions are added when actually met, never invented ahead of the evidence.

## Example prompts

```text
Use arch-monorepo to set up this project with my baseline practices.
Use arch-monorepo to decide how to structure this repository.
Use arch-monorepo to align this repo with my conventions.
Use arch-web to pick the stack for this frontend project.
Use arch-web to decide whether this app needs SSR.
```

## License

MIT
