---
name: commit-clean
description: Delegate cleanup of local branches whose upstream is gone to a cheap subagent. Use when the user asks to clean up stale or gone branches and their worktrees (e.g. "clean up old branches", "清理分支", "clean gone"). Deletes only branches whose remote tracking branch is marked [gone]; the main model must not run git itself and delegates the whole cleanup to a subagent on the host's cheapest available model.
---

# commit-clean

Deleting local branches whose remote is gone is purely mechanical and needs no session context. If the host exposes a subagent-spawning capability, you MUST delegate the cleanup to a subagent running on the host's cheapest available model instead of running git yourself; fall back to running it inline only when the host has no such capability.

Use experimental collab's `spawn_agent` to run the flow below on a cheaper model of the same provider. If collab is not enabled, fall back to running the flow inline yourself.

## The cleanup flow (subagent, or inline fallback)

1. Run `git fetch --prune`, then list local branches whose upstream is marked `[gone]` via `git branch -vv`.
2. Never touch the currently checked-out branch or the default branch (`main`/`master`).
3. For each gone branch: if a linked worktree uses it, remove the worktree first with `git worktree remove`; then delete the branch with `git branch -D`.
4. Delete nothing else — branches with a live upstream, or with no upstream at all, are out of scope.
5. Report the exact list of deleted branches and removed worktrees back to the user, or state that there was nothing to clean.
