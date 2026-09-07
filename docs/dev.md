# dev

`dev` is a small collection of agent skills for plan-driven software development. It splits a development task into three explicit phases — exploration (the product behaviour first when the change is perceptible, then the code), implementation planning, and plan execution — and front-loads every decision that needs a human into the first phase. Once you confirm, the rest of the chain runs to completion without asking again.

The division of labor: the orchestrating agent clarifies what the consumer of the change will see and do, explores the code, grills the requirement into a converged direction, writes the plan, and reviews the result. The implementation itself is delegated by default to a host subagent on the `opus` tier; self-execution remains available.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `dev:explore` | Read-only exploration: for a change its consumer can perceive, clarify the product first — interaction flow, states, UI structure, scope — from the product surface and confirm it; then map the relevant code, grill the technical design question by question until it holds up, compare approaches, and finish with the departure check — the workflow's last confirmation gate. Can also stress-test an existing plan or design. | Product conclusions when the change is perceptible, a codebase map, resolved decisions, an approved direction, and the chosen execution mode. |
| `dev:write-plan` | Turn the converged requirement into a self-contained outcome contract — or, when it decomposes safely, a parallel plan group (contract → parallel members → integration). From the repository's main worktree, it first cuts a branch and worktree named after the requirement and continues there. | `wiki/plans/YYYYMMDD-*.md` plus the `wiki/plans/README.md` index — on a `dev/YYYYMMDD-*` branch under `.claude/worktrees/` when it moved off the main worktree. |
| `dev:execute-plan` | Execute a plan on the current branch — fanning it out into concurrent work packages in per-package worktrees when its milestones are independent — or a parallel group concurrently in per-plan worktrees, by default dispatching implementation to a host subagent on the `opus` tier, then verify every done criterion, review the diff, and merge. | Implementation commits and plan status updates on the current branch. |
| `dev:advisor` | Brief a top-tier subagent as a read-only advisor reading with fresh context, before committing to an approach, when stuck, or before declaring work done. | Review findings and a direction to keep or change. It reviews; it does not implement. |

The skills can be used independently, but they are designed to run as a chain:

```text
dev:explore ──(departure check: the last confirmation)──> dev:write-plan ──> dev:execute-plan
```

After the departure check, the chain is on autopilot: the plan is committed and executed without further confirmation. STOP and BLOCK conditions still halt the chain — those are safety stops, not confirmations — and pushing, opening PRs, or merging always require an explicit user request.

## How the flow works

### 1. Explore and grill (`dev:explore`)

`dev:explore` modifies nothing. It triages the request first, and for a change its consumer can perceive — a page, a flow, copy, a CLI command or its output, the shape of an API call — it **clarifies the product before reading the implementation**: it looks only at the product surface the consumer already sees, grills the consumer and trigger, product form, interaction flow, structure-level UI (layout, components, the empty/loading/error/success states, key copy), scope, and consumer-visible acceptance, then asks one structured confirmation. Visual design stays with the project's design system. Internal changes — bug fixes, refactors, infrastructure, performance — skip this stage.

Then it reads the relevant code, validation commands, and conventions, and clarifies the design by **grilling by default**: it settles only the decisions worth settling before code is written — those expensive to reverse, or where a competent implementer could reasonably go another way — asking one question at a time with a recommended answer, answering from the codebase instead of asking whenever it can, and treating the confirmed product conclusions as settled. In Claude Code a third rung sits between the codebase and you: a technical decision the code and conventions leave open, and that the agent cannot recommend with confidence, goes to the `dev:advisor` advisor first — an answer that settles it as a technical fact or the single sane path removes the question and is cited as evidence alongside `file:line`, while a genuine remaining trade-off still reaches you, with the advisor's view in the recommended answer. If the advisor is unavailable or leaves the point open, the question reaches you as usual. Approaches are compared only where a real fork exists. The direction is stated as short as the risk allows, at the altitude of boundaries and contracts rather than edits, and names what is left to the executor. Say "don't grill me" to switch to minimal questioning. It can also stress-test an existing plan or design document, producing revision notes instead of a new direction.

Exploration ends with the **departure check**, a single structured question that settles everything at once:

1. **Direction** — final approval of the converged approach.
2. **Execution mode** — one of three: subagent (opus), the default; subagent (others), an executor agent pinned to a non-Claude model served through your API relay; or self.
3. **Autopilot** — confirmation that the chain now runs to completion unattended. A review pause after the plan is written is available as an explicit opt-in.
4. **Workspace** — when you are in the main worktree: notice that the plan and its execution will land on a new branch and worktree named after the requirement, and that uncommitted changes would stop the chain. Ask to stay to opt out.

### 2. Plan (`dev:write-plan`)

`dev:write-plan` writes one plan per requirement under `wiki/plans/` as an **outcome contract**: the requirement — carrying the product conclusions when the change is perceptible — the settled decisions with their tradeoffs, landmines, a scope boundary, validation commands, done criteria, stop conditions, and an `Execution:` field carrying the mode chosen at the departure check — leaving implementation design to the executor. It never edits source code and never re-asks settled decisions; minor decisions that surface during planning are made following the approved direction and recorded in the plan.

**Off the main worktree.** When the session is in the repository's main worktree — on any branch — `dev:write-plan` first cuts a branch `dev/YYYYMMDD-slug` and a worktree `.claude/worktrees/YYYYMMDD-slug` from the current `HEAD`, named after the requirement with the same id as the plan, and switches the session into it. The plan commit, the implementation commits, and the status updates all land on that branch; the main worktree keeps its branch untouched, and merging back is yours to request. A dirty tree stops the move rather than leaving uncommitted changes behind, which is why the departure check names pending changes in advance. The planner installs nothing there — `dev:execute-plan` installs dependencies at preflight. Say "plan here" at the departure check, or start from an existing linked worktree, to skip the move.

In Claude Code the plugin's hooks tell the agent where it is instead of leaving it to probe git: the same command hook that discovers executors injects a `<dev-workspace>` block — `kind` main or linked, `path`, `branch` — at session start (including resume and compaction, computed from the session's current directory), and refreshes it with a `pending` entry count whenever `dev:explore` or `dev:write-plan` starts. The skills read the latest block and fall back to `git worktree list` and `git status --porcelain` only when none is present or a worktree switch has superseded it, so other hosts keep working. Every injection from the plugin is delimited this way — `<dev-executors>` wraps executor availability — so the agent can locate it and tell it from repository content; the blocks carry facts, and what to do with them lives in the skills.

Hosts that manage worktrees themselves are handled the same way in `dev:write-plan` and in `dev:execute-plan`'s concurrent execution: when a guard hook denies `git worktree add` and names a replacement — in a coflux project session, the `coflux` MCP tools — the skill creates the branch itself at the intended start point, asks the host tool to add a worktree for that existing branch, and accepts it only once `git worktree list` shows it with its `HEAD` at that start point. Removal goes through the host tool as well. The skill never falls back to the host's generic enter-worktree tool for creation, since that branches from the remote default branch.

When a requirement genuinely decomposes, it may become a **parallel plan group** instead of one plan — but only if the split passes all three parallel-safety criteria: disjoint scopes (shared surfaces such as manifests, route registration, and migrations go to a serial contract plan), a frozen contract between the members, and enough implementation bulk per member to outweigh the merge and review overhead. The canonical shape is contract plan → parallel members → integration plan. A group is for a split that needs such a designed boundary; independent milestones inside one plan need no group — `dev:execute-plan` fans them out at dispatch (see below). Parallelism is a byproduct of a split that meets the bar, not a goal, and the plan's Direction states how its milestones depend on each other so the executor can read independence off the plan.

### 3. Execute and review (`dev:execute-plan`)

Two execution modes, in default preference order:

| Mode | When | Notes |
| --- | --- | --- |
| Subagent (default) | The host has a subagent/task tool (e.g. Claude Code's `Agent`). | Dispatches the host's generic subagent with `model: opus`; runs inside the host's existing permission envelope, so no extra consent is needed. |
| Self-execution | Fallback when no subagent tool exists, or an explicit choice. | The orchestrator implements directly, committing each validated step. |

The default subagent is the host's generic one on the `opus` tier. To run a non-Claude model served through your API relay, name a model-pinned executor agent at the departure check — the plugin ships one executor per relay vendor, exposed as `dev:<vendor>-executor`, each pinning a full model ID in its frontmatter. The agent files under `agents/` are the source of truth for which model each one runs — read the ID there rather than trusting any list in the docs, since relay model IDs move. You can define more the same way in `.claude/agents/` or the user configuration's `agents/` directory. Dispatch pinned executors without a `model` override. Verify which model actually served the run (for example via relay-side logs); a listed model is not proof of actual routing.

**Executor discovery runs in hooks.** With Node.js 22 or later on `PATH`, the plugin's `SessionStart` command hook reads executor bindings, queries the relay's model list, and injects a concise availability snapshot. It runs on new sessions, resume, clear, and compaction, reusing fresh results rather than asking the orchestrator to issue requests. The execution-mode question consumes this snapshot: unavailable executors are excluded, and unverified executors remain explicitly labeled. A recorded user selection is retained; discovery never automatically switches executors.

The hook reads `ANTHROPIC_BASE_URL` and either `ANTHROPIC_AUTH_TOKEN` (Bearer, preferred) or `ANTHROPIC_API_KEY` (`x-api-key`) from its environment. It issues a bounded GET to `/v1/models?limit=1000`, follows Anthropic `has_more`/`last_id` pagination, and also accepts an unpaginated `data` listing. It makes no model-generation request. Missing credentials, timeouts, authentication errors, malformed responses, and incomplete pagination produce **unverified**, not an empty available set. Credentials and raw responses never enter the injected context or cache.

Successful checks are cached for five minutes and failed checks for thirty seconds, scoped by session, relay/credential fingerprint, project, and discovered bindings. Restoring or compacting context re-injects the snapshot; changed credentials or bindings invalidate it. Cache files live in `${CLAUDE_PLUGIN_DATA}/executor-cache`, falling back to the user configuration's `plugins/data/dev/executor-cache`, outside the project. The default user configuration directory is `~/.claude`; `CLAUDE_CONFIG_DIR` overrides it. Parallel checks share a cache lock and writes are atomic.

`PreToolUse(Agent)` validates a selected executor against the same cache, refreshing only when needed. A complete model list that excludes its pinned ID blocks dispatch, as does an explicit Agent `model` argument or a conflicting `CLAUDE_CODE_SUBAGENT_MODEL` with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`. Without force, a different environment default marks routing unverified: it overrode frontmatter before Claude Code 2.1.251, but is only a default in newer hosts. `inherit` is treated as unset. A failed listing adds an unverified warning and leaves the host's normal permission checks intact. Generic agents and other plugins' namespaced agents are unaffected.

Discovery covers this plugin's agents and top-level Markdown files in the user and project agent directories, with project definitions taking precedence over user definitions. Executor names end in `-executor`; `name` and a pinned `model` must be literal frontmatter string scalars (plain, single-quoted, or double-quoted). Claude tier aliases, `inherit`, and omitted model fields do not need relay discovery. A recognized executor with an unreadable explicit model binding is marked unverified and cannot be dispatched through this hook until its binding is fixed. This disk scan is not the host's loaded agent registry: skills use only host-visible types and require their stated binding to agree with the snapshot. Other plugins, CLI-provided agents, and nested files are outside discovery's scope. If hooks are absent or an executor has no snapshot, skills label it unverified and do not replace the hook with manual requests.

Regardless of mode, the orchestrator verifies the result itself: it re-runs every done criterion, reads the full diff against the recorded baseline, checks that only in-scope files changed and that nothing is left uncommitted, and reviews tests for meaningful assertions. Delegated work that needs fixes goes back to the executor as concrete revision feedback (at most two rounds) before the plan is marked BLOCKED.

The roles are split deliberately: the delegated executor **implements only** — it writes the code and the tests the plan requires, but runs no validation commands at all. Every check runs on the orchestrator's side, cheapest first: mechanical checks (unit tests, typecheck, lint), then code review, then acceptance-tier verification — e2e/UI suites, anything needing a running app, browser, or external service, a verify skill. Failures return to the executor as concrete revision feedback carrying the error output. The executor's self-verification would never be accepted as evidence anyway, and self-validation invites fix-loops that bleed effort away from the implementation.

**Concurrent execution.** Under delegation the orchestrator decides, without asking, whether one plan runs as a single unit or as several **work packages** — one subagent per package, each in its own git worktree and branch cut from the recorded baseline. It reads the partition off the plan, never off the code: it splits only along milestones the plan declares (or plainly shows) to be independent, whose in-scope paths partition cleanly with no shared surface such as a manifest, registration, or barrel index, where each package is a slice of behaviour together with its tests, and where each package carries enough work to outweigh dispatch, dependency install, review, and merge. When in doubt, or when the plan is silent, the plan runs as one package — which is exactly today's behaviour. "Don't split" or "split this" in the conversation overrides the judgment.

Each package is verified in its own worktree as it finishes — scope, milestone validations, full code review — then the passing branches are merged back one at a time, and the plan's commands, done criteria, a targeted coherence review, and the acceptance tier run once on the merged result. A wrong split is the orchestrator's mistake, not the plan's: a package that turns out to need a sibling's files, or two packages colliding at merge, falls back to finishing the remaining work serially on the merged branch — never a BLOCK.

A **parallel group** uses the same mechanics, one worktree per member plan. Because the planner drew the members' disjoint scopes with exploration context, a merge conflict there is evidence of a scope violation and is handled as a verification failure, never resolved silently.

Set expectations accordingly: work packages remove the authoring cost of a plan group for plans whose milestones are genuinely independent. They do not find parallelism the planner could not see, and most single-requirement plans still run as one package.

## Second opinion

`dev:advisor` dispatches the host's generic subagent on the top Claude tier
(`fable`) and briefs it as an advisor: review rather than implement, read the
repository and run read-only commands such as `git diff` and non-mutating
checks, answer. There is no advisor agent definition and no prompt template —
the skill states the principles every brief must carry (the role, the
read-only boundary, the shape of a useful answer), and the orchestrator writes
each brief in its own words. Pass the tier explicitly: a subagent dispatched
without a `model` inherits the orchestrator's, and an advisor at or below the
model it reviews is worse than none.

Its leverage is not only the tier. It arrives with fresh context, reads the code
itself instead of trusting your account of it, and is asked for a verdict rather
than a diff — so what comes back is a judgment you act on, not work you have to
review.

Call it before substantive work — before writing, before committing to an
interpretation — and again before declaring the work done. Orientation first is
fine; orientation is not substantive work. On short reactive tasks, one call is
usually enough: its value is highest before the approach crystallizes.

The advisor does not inherit the conversation. State the problem, the
constraints, and the specific question, and point at the code rather than
summarizing it — it reads the files itself. When its advice contradicts data
you already retrieved, do not switch silently: name the conflict in one more
call and let the tie be broken on evidence.

## Example prompts

```text
Use dev:explore to understand how authentication works in this repo.
Use dev:explore to grill me about this refactoring idea before we plan it.
Use dev:explore to stress-test wiki/plans/20260821-share-link-claim before we execute it.

Use dev:write-plan to plan adding password reset support.
Use dev:write-plan to turn this bug report into an implementation plan.

Use dev:execute-plan to implement wiki/plans/20260821-share-link-claim.
Use dev:execute-plan to execute the next TODO plan.
Use dev:execute-plan to delegate wiki/plans/20260822-rate-limit-headers to a subagent and review the result.
Use dev:execute-plan to run plans 002 and 003 in parallel.
Use dev:execute-plan to implement wiki/plans/20260821-share-link-claim without splitting it.

Use dev:advisor to get a second opinion before I commit to this approach.
Use dev:advisor to check this design — I keep hitting the same error.
Use dev:advisor to review what I just finished before we call it done.
```

## License

MIT
