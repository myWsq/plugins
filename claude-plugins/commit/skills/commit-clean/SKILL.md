---
name: commit-clean
description: Delete local branches whose upstream is gone, along with their linked worktrees. Use when the user asks to clean up stale or gone branches (e.g. "clean up old branches", "清理分支", "clean gone"). Deletes only branches whose remote tracking branch is marked [gone].
---

# commit-clean

Delete local branches whose remote tracking branch is marked `[gone]` — typically the leftovers of merged pull requests. Nothing else is in scope.

## The cleanup flow

1. Run `git fetch --prune`, then list local branches whose upstream is marked `[gone]` via `git branch -vv`.
2. Never touch the currently checked-out branch or the default branch (`main`/`master`).
3. For each gone branch: if a linked worktree uses it, remove the worktree first with `git worktree remove`; then delete the branch with `git branch -D`.
4. Delete nothing else — branches with a live upstream, or with no upstream at all, are out of scope.
5. Report the exact list of deleted branches and removed worktrees, or state that there was nothing to clean.
