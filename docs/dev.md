# dev

`dev` is a small collection of agent skills for plan-driven software development. It splits a development task into three explicit phases — code exploration, implementation planning, and plan execution — and front-loads every decision that needs a human into the first phase. Once you confirm, the rest of the chain runs to completion without asking again.

The division of labor: the orchestrating agent explores the code, grills the requirement into a converged direction, writes the plan, and reviews the result. The implementation itself is delegated by default to the `claude-executor` subagent, whose Claude tier is pinned in its frontmatter; self-execution remains available.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `dev-explore` | Read-only exploration: map the relevant code, grill the requirement question by question until the design holds up, compare approaches, and finish with the departure check — the workflow's single confirmation gate. Can also stress-test an existing plan or design. | A codebase map, resolved decisions, an approved direction, and the chosen execution mode. |
| `dev-write-plan` | Turn the converged requirement into a self-contained outcome contract — or, when it decomposes safely, a parallel plan group (contract → parallel members → integration). | `wiki/plans/YYYYMMDD-*.md` plus the `wiki/plans/README.md` index. |
| `dev-execute-plan` | Execute a plan on the current branch, or a parallel group concurrently in per-plan worktrees — by default dispatching implementation to the `claude-executor` subagent — then verify every done criterion, review the diff, and merge. | Implementation commits and plan status updates on the current branch. |
| `dev-advisor` | Consult the `advisor` subagent — a top-tier reviewer reading with fresh context — before committing to an approach, when stuck, or before declaring work done. | Review findings and a direction to keep or change. It reviews; it does not implement. |

The skills can be used independently, but they are designed to run as a chain:

```text
dev-explore ──(departure check: the last confirmation)──> dev-write-plan ──> dev-execute-plan
```

After the departure check, the chain is on autopilot: the plan is committed and executed without further confirmation. STOP and BLOCK conditions still halt the chain — those are safety stops, not confirmations — and pushing, opening PRs, or merging always require an explicit user request.

## How the flow works

### 1. Explore and grill (`dev-explore`)

`dev-explore` reads the relevant code, validation commands, and conventions without modifying anything. For a proposed change, it clarifies by **grilling by default**: it walks down each branch of the design decision tree, asking one question at a time with a recommended answer, and answering from the codebase instead of asking whenever it can. Say "don't grill me" to switch to minimal questioning. It can also stress-test an existing plan or design document, producing revision notes instead of a new direction.

Exploration ends with the **departure check**, a single structured question that settles everything at once:

1. **Direction** — final approval of the converged approach.
2. **Execution mode** — one of three: subagent (opus), the default `claude-executor`; subagent (others), an executor agent pinned to a non-Claude model served through your API relay; or self.
3. **Autopilot** — confirmation that the chain now runs to completion unattended. A review pause after the plan is written is available as an explicit opt-in.

### 2. Plan (`dev-write-plan`)

`dev-write-plan` writes one plan per requirement under `wiki/plans/` as an **outcome contract**: the requirement, the settled decisions with their tradeoffs, landmines, a scope boundary, validation commands, done criteria, stop conditions, and an `Execution:` field carrying the mode chosen at the departure check — leaving implementation design to the executor. It never edits source code and never re-asks settled decisions; minor decisions that surface during planning are made following the approved direction and recorded in the plan.

When a requirement genuinely decomposes, it may become a **parallel plan group** instead of one plan — but only if the split passes all three parallel-safety criteria: disjoint scopes (shared surfaces such as manifests, route registration, and migrations go to a serial contract plan), a frozen contract between the members, and enough implementation bulk per member to outweigh the merge and review overhead. The canonical shape is contract plan → parallel members → integration plan. Parallelism is a byproduct of a split that meets the bar, not a goal.

### 3. Execute and review (`dev-execute-plan`)

Two execution modes, in default preference order:

| Mode | When | Notes |
| --- | --- | --- |
| Subagent (default) | The host has a subagent/task tool (e.g. Claude Code's `Agent`). | Dispatches the `claude-executor` agent, whose Claude tier is pinned in its frontmatter; runs inside the host's existing permission envelope, so no extra consent is needed. |
| Self-execution | Fallback when no subagent tool exists, or an explicit choice. | The orchestrator implements directly, committing each validated step. |

The default subagent is `claude-executor`, pinned to a Claude tier alias. To run a non-Claude model served through your API relay, name a model-pinned executor agent at the departure check — the plugin ships one executor per relay vendor, named `<vendor>-executor`, each pinning a full model ID in its frontmatter. The agent files under `agents/` are the source of truth for which model each one runs — read the ID there rather than trusting any list in the docs, since relay model IDs move. You can define more the same way in `.claude/agents/`. Note that an unrecognized or blocked model value silently falls back to the inherited model, so verify which model actually served the run (for example via relay-side logs).

Regardless of mode, the orchestrator verifies the result itself: it re-runs every done criterion, reads the full diff against the recorded baseline, checks that only in-scope files changed and that nothing is left uncommitted, and reviews tests for meaningful assertions. Delegated work that needs fixes goes back to the executor as concrete revision feedback (at most two rounds) before the plan is marked BLOCKED.

The roles are split deliberately: the delegated executor **implements only** — it writes the code and the tests the plan requires, but runs no validation commands at all. Every check runs on the orchestrator's side, cheapest first: mechanical checks (unit tests, typecheck, lint), then code review, then acceptance-tier verification — e2e/UI suites, anything needing a running app, browser, or external service, a verify skill. Failures return to the executor as concrete revision feedback carrying the error output. The executor's self-verification would never be accepted as evidence anyway, and self-validation invites fix-loops that bleed effort away from the implementation.

For a **parallel group**, each member is dispatched into its own git worktree and branch; the orchestrator verifies each member as it finishes, then merges the passing branches back sequentially. Disjoint scopes make these merges conflict-free by construction — a merge conflict is evidence of a scope violation and is handled as a verification failure, never resolved silently.

## Second opinion

`dev-advisor` (Claude Code only — Codex has no subagent mechanism) dispatches
the `advisor` subagent: `fable`, pinned in the agent's frontmatter, instructed
to review rather than implement. It reads the repository, runs read-only
commands such as `git diff` and non-mutating checks, and answers. Dispatch it
without a `model` argument — a per-invocation override replaces the pinned tier.

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
Use dev-explore to understand how authentication works in this repo.
Use dev-explore to grill me about this refactoring idea before we plan it.
Use dev-explore to stress-test wiki/plans/003 before we execute it.

Use dev-write-plan to plan adding password reset support.
Use dev-write-plan to turn this bug report into an implementation plan.

Use dev-execute-plan to implement wiki/plans/001.
Use dev-execute-plan to execute the next TODO plan.
Use dev-execute-plan to delegate wiki/plans/002 to a subagent and review the result.
Use dev-execute-plan to run plans 002 and 003 in parallel.

Use dev-advisor to get a second opinion before I commit to this approach.
Use dev-advisor to check this design — I keep hitting the same error.
Use dev-advisor to review what I just finished before we call it done.
```

## License

MIT
