# dev

`dev` is a small collection of agent skills for plan-driven software development. It splits a development task into three explicit phases — code exploration, implementation planning, and plan execution — and front-loads every decision that needs a human into the first phase. Once you confirm, the rest of the chain runs to completion without asking again.

The division of labor: the orchestrating agent explores the code, grills the requirement into a converged direction, writes the plan, and reviews the result. The implementation itself is delegated by default to a subagent running on a lower model tier; self-execution remains available.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `dev-explore` | Read-only exploration: map the relevant code, grill the requirement question by question until the design holds up, compare approaches, and finish with the departure check — the workflow's single confirmation gate. Can also stress-test an existing plan or design. | A codebase map, resolved decisions, an approved direction, and the chosen execution mode. |
| `dev-write-plan` | Turn the converged requirement into a self-contained outcome contract — or, when it decomposes safely, a parallel plan group (contract → parallel members → integration). | `wiki/plans/NNN-*.md` plus the `wiki/plans/README.md` index. |
| `dev-execute-plan` | Execute a plan on the current branch, or a parallel group concurrently in per-plan worktrees — by default dispatching implementation to a lower-tier subagent — then verify every done criterion, review the diff, and merge. | Implementation commits and plan status updates on the current branch. |

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
2. **Execution mode** — subagent (recommended default) or self-execution, plus the subagent's model if you care: a Claude tier alias, or a pre-created executor agent pinned to a non-Claude model served through your API relay.
3. **Autopilot** — confirmation that the chain now runs to completion unattended. A review pause after the plan is written is available as an explicit opt-in.

### 2. Plan (`dev-write-plan`)

`dev-write-plan` writes one plan per requirement under `wiki/plans/` as an **outcome contract**: the requirement, the settled decisions with their tradeoffs, landmines, a scope boundary, validation commands, done criteria, stop conditions, and an `Execution:` field carrying the mode chosen at the departure check — leaving implementation design to the executor. It never edits source code and never re-asks settled decisions; minor decisions that surface during planning are made following the approved direction and recorded in the plan.

When a requirement genuinely decomposes, it may become a **parallel plan group** instead of one plan — but only if the split passes all three parallel-safety criteria: disjoint scopes (shared surfaces such as manifests, route registration, and migrations go to a serial contract plan), a frozen contract between the members, and enough implementation bulk per member to outweigh the merge and review overhead. The canonical shape is contract plan → parallel members → integration plan. Parallelism is a byproduct of a split that meets the bar, not a goal.

### 3. Execute and review (`dev-execute-plan`)

Two execution modes, in default preference order:

| Mode | When | Notes |
| --- | --- | --- |
| Subagent (default) | The host has a subagent/task tool (e.g. Claude Code's `Agent`). | Typically one model tier below the orchestrator; runs inside the host's existing permission envelope, so no extra consent is needed. |
| Self-execution | Fallback when no subagent tool exists, or an explicit choice. | The orchestrator implements directly, committing each validated step. |

The subagent's model is normally a Claude tier alias. To run a non-Claude model served through your API relay, name a model-pinned executor agent at the departure check — the plugin ships `gpt-executor` (gpt-5.6-sol) and `kimi-executor` (kimi-k3), and you can define more in `.claude/agents/` by pinning a full model ID in the frontmatter. Note that an unrecognized or blocked model value silently falls back to the inherited model, so verify which model actually served the run (for example via relay-side logs).

Regardless of mode, the orchestrator verifies the result itself: it re-runs every done criterion, reads the full diff against the recorded baseline, checks that only in-scope files changed and that nothing is left uncommitted, and reviews tests for meaningful assertions. Delegated work that needs fixes goes back to the executor as concrete revision feedback (at most two rounds) before the plan is marked BLOCKED.

The roles are split deliberately: the delegated executor **implements only** — it writes the code and the tests the plan requires, but runs no validation commands at all. Every check runs on the orchestrator's side, cheapest first: mechanical checks (unit tests, typecheck, lint), then code review, then acceptance-tier verification — e2e/UI suites, anything needing a running app, browser, or external service, a verify skill. Failures return to the executor as concrete revision feedback carrying the error output. The executor's self-verification would never be accepted as evidence anyway, and self-validation invites fix-loops that bleed effort away from the implementation.

For a **parallel group**, each member is dispatched into its own git worktree and branch; the orchestrator verifies each member as it finishes, then merges the passing branches back sequentially. Disjoint scopes make these merges conflict-free by construction — a merge conflict is evidence of a scope violation and is handled as a verification failure, never resolved silently.

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
```

## License

MIT
