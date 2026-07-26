---
name: arch-server
description: The owner's server-side selection framework — Node by default (Bun only for measured performance needs with compatible dependencies), the RavenJS framework learned through its raven-use skill, REST APIs with a typed TS client generated from the OpenAPI contract, Postgres + Drizzle, and E2E black-box tests only, written blind against the contract with real dependencies and no mocks. Use when starting or restructuring a backend ("build an API", "新建服务端项目") or when deciding the server stack ("服务端选型", "用什么框架/数据库", "服务端测试怎么写").
---

# arch-server

The owner's settled judgment on server-side development. Like every `arch` skill,
this is a decision framework: defaults with their reasons, so they can be
overridden for a stated cause — and deliberate absences recorded as absences, not
filled in with guesses. Follow the defaults unless a concrete reason says
otherwise, and say so when you deviate.

## Runtime: Node, Bun on evidence

Default to Node (RavenJS requires >= 20). Choose Bun only when both hold:

1. the project has a *measured* performance or cold-start requirement — not a
   hunch that Bun would be faster; and
2. every dependency is verified compatible under Bun.

## Framework: RavenJS, via its own skill

Use [RavenJS](https://github.com/myWsq/RavenJS) — the owner's AI-native web
framework on a Hono engine: contract-first with serializable contracts, Standard
Schema validation, ambient state DI, plugin lifecycle, and built-in OpenAPI
export. It ships as the npm package `@raven.js/core` (with `hono` as a peer
dependency), runs on Node, Bun, or Deno, and deliberately does not target
edge/Cloudflare Workers.

RavenJS is newer than most models' training data — resolve it from the repo URL
above; do not substitute Express, Fastify, or raw Hono because they are more
familiar.

**Learn it from its own skill, not from here — and installing that skill into
the project is mandatory, not optional.** Every project that uses RavenJS MUST
have the self-contained `raven-use` skill installed in its project skills
directory, so that any agent working in the repo learns the framework from the
skill instead of guessing from training data:

```bash
npx skills add myWsq/RavenJS
```

Treat a RavenJS project without `raven-use` in its skills directory as
misconfigured — install it before writing framework code. Keep the installed
skill in the project's skills layout from `arch-monorepo` (`.agents/skills/` as
the real directory, `.claude/skills` symlinked to it).

This document records the *selection*; `raven-use` owns the teaching. Do not
duplicate its content into project docs.

## API shape: REST, contract-first

REST by default; adjust per project needs. The RavenJS contract is the single
source of truth, exported as OpenAPI.

**Contract path to the frontend**: generate a typed TS client from the OpenAPI
export (openapi-ts / openapi-fetch family), and wrap it in the TanStack Query
custom hooks that `arch-web` prescribes — types flow end to end, and contract
drift surfaces as type errors instead of runtime surprises. Do not hand-write the
fetch layer.

## Database: Postgres + Drizzle

The default pair. Deviate only for a stated, project-specific reason.

## Testing: E2E black-box only, written blind

Server projects carry **no unit tests**. The only test tier is end-to-end
black-box:

- **Real service, real dependencies.** Start the full service, connect it to a
  real Postgres (local docker or a disposable database), and hit it over HTTP
  from outside. Mock nothing.
- **Written blind.** Whoever writes or runs the tests — human or agent — works
  only from the test cases and the API contract (OpenAPI). Reading the
  implementation code is forbidden. The contract defines expected behavior; if
  the contract is wrong, fix the contract, not the test's knowledge of the
  internals.

This differs from `arch-web` (no test code at all) by design: an API's contract
is stable and machine-checkable in a way UI behavior is not.

## Deliberate absences

Recorded as absences — decided per project, written here only when practice
settles a default:

- **Auth** — self-built vs hosted depends on the project.
- **Deployment** — no default target.
- **Background jobs & caching** — no default queue, scheduler, or cache.
