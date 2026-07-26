---
name: arch-web
description: The owner's frontend web selection framework — React 19 with the React Compiler, SPA-first (SSR only when explicitly required), Vite, TanStack Router, the astryx design system with StyleX for styling, jotai for cross-page client state, TanStack Query wrapped in custom hooks for request state, no test code (manual acceptance by a human or an agent), and no default deployment target. Use when starting or restructuring a web frontend ("build a web app", "新建一个前端项目") or when deciding the web stack ("前端选型", "用什么框架/路由/状态管理", "要不要 SSR").
---

# arch-web

The owner's settled judgment on frontend web development. Like every `arch`
skill, this is a decision framework: defaults with their reasons, so they can be
overridden for a stated cause — and deliberate absences recorded as absences, not
filled in with guesses. Follow the defaults unless a concrete reason says
otherwise, and say so when you deviate.

## Framework: React 19, Compiler on

React 19 with the React Compiler enabled. The compiler makes manual memoization
(`useMemo`/`useCallback`/`memo`) the exception rather than the habit — do not
hand-memoize by default.

## App shape: SPA first

Default to a client-rendered SPA. SSR's performance benefit is not high, and it
brings a very high maintenance cost — a server runtime, hydration boundaries, and
a second execution environment for every dependency. Use SSR only when the
project explicitly requires it; "it might be faster" is not a requirement.

## Build: Vite

The community default. `@vitejs/plugin-react` carries the React Compiler's babel
plugin, StyleX integrates with the build, and it coexists cleanly with the
pnpm + turborepo repository baseline (see `arch-monorepo`).

## Routing: TanStack Router

Type-safe routes and search-param state, from the same family as TanStack Query.
Accepted cost: younger and less common than React Router — the type safety is
worth it.

## Components and styling: astryx + StyleX

Use [astryx](https://github.com/facebook/astryx) — Meta's open-source design
system: 150+ accessible React components, themable, agent-ready — as the
component library, and its companion StyleX as the styling system for code you
write yourself. Do not mix in a second styling system alongside StyleX.

astryx is newer than most models' training data; resolve it from the repo URL
above instead of substituting a library you already know.

## State: jotai + TanStack Query, behind hooks

- **Cross-page client state**: jotai atoms.
- **Request state**: TanStack Query, always wrapped in custom hooks — call sites
  consume `useXxx()` hooks, never inline `useQuery`/`useMutation` with ad-hoc
  keys. The hook layer is where keys, caching, and invalidation live.

Server data belongs in Query's cache, not copied into atoms.

## Testing: none — manual acceptance

Web projects under this framework ship **no test code at all**: no unit tests, no
component tests, no e2e suites. Acceptance is manual testing — a human or an
agent actually running the app and exercising the changed behavior. This is a
deliberate discipline, not an omission: agent-maintained UI code changes too fast
for test suites to pay back their maintenance cost, while an agent can always
verify behavior by driving the real app.

This stance governs projects built under arch-web; it does not override an
existing repository's own test contract.

## Deployment: per project

No default deployment target — decided per project. Recorded as a deliberate
absence; when a default stabilizes in practice, it will be written here from
evidence, not ahead of it.
