# dev

`dev` is a small collection of agent skills for plan-driven software development. It splits a development task into three explicit phases — exploration (the product behaviour first when the change is perceptible, then the code), implementation planning, and plan execution — and front-loads every decision that needs a human into the first phase. Everything you must decide is settled at exploration's fixed gates — the product confirmation for a perceptible change, and the departure check at the end; the rest of the chain then runs to the endpoint you chose without asking again.

The division of labor: the orchestrating agent clarifies what the consumer of the change will see and do, explores the code, grills the requirement into a converged direction, writes the plan, and reviews the result. The implementation itself is delegated by default to a host subagent using `opus` where supported, otherwise the host default; self-execution remains available.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `dev:explore` | Read-only exploration: for a change its consumer can perceive, clarify the product first — interaction flow, states, UI structure, scope — from the product surface and confirm it; then map the relevant code, grill the technical design question by question until it holds up, compare approaches, and close with the departure check. Can also stress-test an existing plan or design. | Product conclusions when the change is perceptible, a codebase map, resolved decisions, an approved direction, and the departure-check answers. |
| `dev:write-plan` | Turn the converged requirement into a self-contained outcome contract — or, when it decomposes safely, a parallel plan group (contract → parallel members → integration). From the repository's main worktree, it first cuts a branch and worktree named after the requirement and continues there. | `wiki/plans/YYYYMMDD-*.md` plus the `wiki/plans/README.md` index — on a `dev/YYYYMMDD-*` branch under `.claude/worktrees/` when it moved off the main worktree. |
| `dev:execute-plan` | Execute a plan on the current branch — fanning it out into concurrent work packages in per-package worktrees when its milestones are independent — or a parallel group concurrently in per-plan worktrees, by default dispatching implementation to a host subagent using `opus` where supported, otherwise the host default, then verify every done criterion, review the diff, and merge. | Implementation commits and plan status updates on the current branch. |

The skills can be used independently, but they are designed to run as a chain:

```text
dev:explore ──> dev:write-plan ──[plan audit]──> dev:execute-plan
 discussion       plan            optional audit   implementation + verification
```

The plan audit appears in the chain only as that optional review, chosen at the departure check. It is not a skill you invoke: for a second opinion at any other moment, use what your host provides — in Claude Code, its built-in advisor.

The departure check determines where the chain stops: discussion ends in chat, the review pause ends after writing the plan, and autopilot continues through execution and verification — optionally with an audit of the finished plan on the way. Readiness does not expand authorization. STOP and BLOCK conditions still halt the chain — those are safety stops, not confirmations — and pushing, opening PRs, or merging always require an explicit user request.

## How the flow works

### 1. Explore and grill (`dev:explore`)

`dev:explore` modifies nothing. It triages the request first, and for a change its consumer can perceive — a page, a flow, copy, a CLI command or its output, the shape of an API call — it **clarifies the product before reading the implementation**: it looks only at the product surface the consumer already sees, grills the consumer and trigger, product form, interaction flow, structure-level UI (layout, components, the empty/loading/error/success states, key copy), scope, and consumer-visible acceptance, then confirms the conclusions in one structured question. Visual design stays with the project's design system. Internal changes — bug fixes, refactors, infrastructure, performance — skip this stage.

Then it reads the relevant code, validation commands, and conventions, and clarifies the design by **grilling by default**: it settles only the decisions worth settling before code is written — those expensive to reverse, or where a competent implementer could reasonably go another way — asking one question at a time with a recommended answer, answering from the codebase instead of asking whenever it can, and reusing the product conclusions. Approaches are compared only where a real fork exists. The direction is stated as short as the risk allows, at the altitude of boundaries and contracts rather than edits, and names what is left to the executor. Say "don't grill me" to switch to minimal questioning. It can also stress-test an existing plan or design document, producing revision notes instead of a new direction.

Exploration then closes with the **departure check** — the workflow's last confirmation gate, and a fixed one: whenever the chain continues into planning it asks a single structured question bundling the same three items, even for a small change where every item already has a recommended value.

1. **Direction** — the approved direction, restated in one or two sentences.
2. **Execution mode** — the question defined canonically in `dev:execute-plan`: the generic subagent on `opus`, the generic subagent on `fable`, or self-execution. Answering here is final.
3. **Autopilot** — confirm that `dev:write-plan` and `dev:execute-plan` then run to completion without further confirmation, take the **review pause** to stop and read the plan first, or take the **plan audit**: `dev:write-plan` sends the finished plan to a top-tier subagent that reads the code itself, revises it on the findings, and continues into execution without stopping. The plan audit is the recommended default whenever it is available — a subagent tool present and the orchestrator not already on the audit's tier; otherwise the option is omitted and plain autopilot is recommended.

The workspace is not one of them. Where the work happens is read off the injected `<dev-workspace>` block rather than confirmed: from the main worktree `dev:write-plan` cuts the requirement's branch and worktree and continues there; inside a linked worktree it stays put. The departure check states which of the two will happen, along with any pending changes that would stop the move, as information — saying "plan here" is still an override, it is just no longer a question.

The three answers become the **start contract** the three skills share — `Direction and scope`, `Stop after`, `Execution` — carried through the handoff and recorded in the plan with each value's basis, next to the `Workspace` value the planner inspected. Downstream skills treat them as standing authorization and never re-ask; a later explicit user instruction supersedes an older plan field. A mode the host cannot support falls back per `dev:execute-plan`'s rules and is reported, never silently.

Expected behavior for common requests:

| Request or condition | Result |
| --- | --- |
| "Implement this with opus and verify it." | Reuse the named model at the departure check's execution item rather than offering the menu; still confirm direction and autopilot once. |
| "Think through how this could work." | Discuss and stop; no departure check, no execution question. |
| "Write a plan first; I want to review it." | Take the review pause at the departure check; write the plan and stop. |
| "Audit the plan, then go ahead." | Take the plan audit at the departure check; write the plan, revise it on the findings, and continue into execution. |
| "Now execute that plan." | Resume with the recorded execution mode; do not re-run the departure check. |
| The host has no subagent tool | Fall back to self-execution and say so in the report; no other agent type is ever substituted. |
| A material product decision remains open | Settle it in step 2's product confirmation before the technical grilling starts. |

### 2. Plan (`dev:write-plan`)

`dev:write-plan` writes one plan per requirement under `wiki/plans/` as an **outcome contract**: the requirement — carrying the product conclusions when the change is perceptible — the settled decisions with their tradeoffs, landmines, a scope boundary, validation commands, done criteria, stop conditions, and `Execution:`, `Stop after:`, `Plan review:`, and `Workspace:` fields carrying the departure-check answers and their basis — leaving implementation design to the executor. It never edits source code and never re-asks settled decisions; minor decisions that surface during planning are made following the approved direction and recorded in the plan.

Under `Plan review: audit` it sends the finished plan to a top-tier subagent once before handoff, following `references/plan-audit.md`. Findings inside the approved direction — a loosely worded decision, a missing landmine, a scope or done-criteria gap, a wrong command — are folded into the plan and marked `(revised on plan audit)`; a finding that undermines the direction or the requirement itself is a STOP, reported to you with its evidence. If the audit cannot be dispatched, the plan is not executed unreviewed: the chain falls back to the review pause and waits for you. When the orchestrator itself already runs on the audit's tier — the hook-injected `<dev-orchestrator>` block says `top-tier: yes` — the departure check does not offer the review and `dev:write-plan` skips it, recording why in the plan.

**Off the main worktree.** When the session is in the repository's main worktree — on any branch — `dev:write-plan` first cuts a branch `dev/YYYYMMDD-slug` and a worktree `.claude/worktrees/YYYYMMDD-slug` from the current `HEAD`, named after the requirement with the same id as the plan, and switches the session into it. The plan commit, the implementation commits, and the status updates all land on that branch; the main worktree keeps its branch untouched, and merging back is yours to request. A dirty tree stops the move rather than leaving uncommitted changes behind; the agent reports the pending changes. The planner installs nothing there — `dev:execute-plan` installs dependencies at preflight. Say "plan here", or start from an existing linked worktree, to skip the move.

In Claude Code the plugin's hooks tell the agent where it is instead of leaving it to probe git: a command hook (`hooks/context.mjs`, Node.js 22 or later on `PATH`) injects a `<dev-workspace>` block — `kind` main or linked, `path`, `branch` — at session start (including resume and compaction, computed from the session's current directory), and refreshes it with a `pending` entry count whenever `dev:explore` or `dev:write-plan` starts. At the same moments it injects a `<dev-orchestrator>` block — `model`, the active model identifier, and `top-tier`, whether that model is the tier the plan audit dispatches — taken from the hook's `model` field at session start and otherwise from the last assistant entry in the session transcript, so a `/model` switch is picked up by the next skill start; when neither source names a model the block is omitted rather than guessed. The skills read the latest block and fall back to `git worktree list` and `git status --porcelain` only when none is present or a worktree switch has superseded it, so other hosts keep working. Every injection from the plugin is delimited this way so the agent can locate it and tell it from repository content; the blocks carry facts, and what to do with them lives in the skills. The hook never blocks a tool call: a failed snapshot injects nothing.

**Working principles ride with every session.** The plugin ships `hooks/principles.md` — how to communicate, which instruction wins, how to execute, test, and delegate — and the same `SessionStart` hook injects it verbatim as a `<dev-principles>` block on startup, resume, clear, and compaction, so the guidance survives context compaction without being repeated on every prompt. Unlike the other two blocks it carries guidance, not facts: it applies to every task in the session, whether or not a `dev` skill runs. It ranks below system and platform constraints and below the user's current explicit instruction, and a project's `AGENTS.md` supplements or overrides it within that project. Skill starts never re-inject it. Edit the file to change the guidance; a missing or empty file just drops the block.

Hosts that manage worktrees themselves are handled the same way in `dev:write-plan` and in `dev:execute-plan`'s concurrent execution: when a guard hook denies `git worktree add`, the skill follows the replacement the denial names and nothing more: it creates the branch itself at the intended start point when the replacement would pick its own, asks the replacement for a worktree on that existing branch, and accepts it only once `git worktree list` shows it with its `HEAD` at that start point. Removal goes through the replacement named for it as well. The skills never name a particular host; what a host does beyond its denial is that host's concern. The skill never falls back to the host's generic enter-worktree tool for creation, since that branches from the remote default branch.

When a requirement genuinely decomposes, it may become a **parallel plan group** instead of one plan — but only if the split passes all three parallel-safety criteria: disjoint scopes (shared surfaces such as manifests, route registration, and migrations go to a serial contract plan), a frozen contract between the members, and enough implementation bulk per member to outweigh the merge and review overhead. The canonical shape is contract plan → parallel members → integration plan. A group is for a split that needs such a designed boundary; independent milestones inside one plan need no group — `dev:execute-plan` fans them out at dispatch (see below). Parallelism is a byproduct of a split that meets the bar, not a goal, and the plan's Direction states how its milestones depend on each other so the executor can read independence off the plan.

### 3. Execute and review (`dev:execute-plan`)

Two execution modes, in default preference order:

| Mode | When | Notes |
| --- | --- | --- |
| Subagent (default) | The host has a subagent/task tool (e.g. Claude Code's `Agent`). | Dispatches the host's generic subagent with `model: opus` by default, or `model: fable` when chosen, only where the host supports the alias, otherwise the host default; runs inside the host's existing permission envelope, so no extra consent is needed. |
| Self-execution | Fallback when no subagent tool exists, or an explicit choice. | The orchestrator implements directly, committing each validated step. |

The execution-mode question therefore has exactly three answers — `subagent(opus)`, `subagent(fable)`, and `self` — and the answer lands in the plan's `Execution:` field. The plugin ships no agent definitions of its own: every delegated run goes to the host's generic subagent on a Claude tier, so there is nothing to discover, verify, or pin, and the skills never run model discovery or dispatch any other agent type. An older plan that still records a retired `dev:<vendor>-executor` value runs as `subagent(opus)`, and the report states the mapping.

Regardless of mode, the orchestrator verifies the result itself: it re-runs every done criterion, reads the full diff against the recorded baseline, checks that only in-scope files changed and that nothing is left uncommitted, and reviews tests for meaningful assertions. Delegated work that needs fixes goes back to the executor as concrete revision feedback (at most two rounds) before the plan is marked BLOCKED.

The roles are split deliberately: the delegated executor **implements only** — it writes the code and the tests the plan requires, but runs no validation commands at all. Every check runs on the orchestrator's side, cheapest first: mechanical checks (unit tests, typecheck, lint), then code review, then acceptance-tier verification — e2e/UI suites, anything needing a running app, browser, or external service, a verify skill. Failures return to the executor as concrete revision feedback carrying the error output. The executor's self-verification would never be accepted as evidence anyway, and self-validation invites fix-loops that bleed effort away from the implementation.

**Concurrent execution.** Under delegation the orchestrator decides, without asking, whether one plan runs as a single unit or as several **work packages** — one subagent per package, each in its own git worktree and branch cut from the recorded baseline. It reads the partition off the plan, never off the code: it splits only along milestones the plan declares (or plainly shows) to be independent, whose in-scope paths partition cleanly with no shared surface such as a manifest, registration, or barrel index, where each package is a slice of behaviour together with its tests, and where each package carries enough work to outweigh dispatch, dependency install, review, and merge. When in doubt, or when the plan is silent, the plan runs as one package — which is exactly today's behaviour. "Don't split" or "split this" in the conversation overrides the judgment.

Each package is verified in its own worktree as it finishes — scope, milestone validations, full code review — then the passing branches are merged back one at a time, and the plan's commands, done criteria, a targeted coherence review, and the acceptance tier run once on the merged result. A wrong split is the orchestrator's mistake, not the plan's: a package that turns out to need a sibling's files, or two packages colliding at merge, falls back to finishing the remaining work serially on the merged branch — never a BLOCK.

A **parallel group** uses the same mechanics, one worktree per member plan. Because the planner drew the members' disjoint scopes with exploration context, a merge conflict there is evidence of a scope violation and is handled as a verification failure, never resolved silently.

Set expectations accordingly: work packages remove the authoring cost of a plan group for plans whose milestones are genuinely independent. They do not find parallelism the planner could not see, and most single-requirement plans still run as one package.

## Plan audit

Under `Plan review: audit`, `dev:write-plan` dispatches the host's generic
subagent on the top Claude tier (`fable`) and briefs it as a reviewer: audit
rather than implement, read the repository and run read-only commands such as
`git diff` and non-mutating checks, answer. There is no reviewer agent
definition and no prompt template — `dev:write-plan`'s
`references/plan-audit.md` states the principles every brief must carry (the
role, the read-only boundary, the shape of a useful answer), and the
orchestrator writes each brief in its own words. Pass the tier explicitly: a
subagent dispatched without a `model` inherits the orchestrator's, and a
reviewer at or below the model it reviews is worse than none.

Its leverage is not only the tier. It arrives with fresh context, reads the
code itself instead of trusting the plan's account of it, and is asked for a
verdict rather than a diff — so what comes back is a judgment you act on, not
work you have to review. That is also what a reviewer reading only the
conversation cannot do: check a `file:line` the plan cites but nobody opened,
or a validation command nobody ran.

The audit has exactly one trigger: the departure check chose it. There is no
skill to invoke by name and no path for the agent to start one on its own
judgment. For a second opinion at any other moment — mid-implementation, on a
design, on finished work — use what your host provides; Claude Code has a
built-in advisor for exactly that, and this plugin deliberately leaves that
job to it.

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
```

## License

MIT
