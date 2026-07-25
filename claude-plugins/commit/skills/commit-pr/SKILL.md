---
name: commit-pr
description: Commit, push, and open a pull request without ever switching the working tree's branch. Use when the user asks to open a PR, ship changes as a pull request, or says things like "open a PR", "commit and open a PR", "提交并开 PR". On the default branch it publishes the commit as a new remote branch instead of checking one out.
---

# commit-pr

The full ship-it flow: commit, push, open a pull request. Invoking this command is the explicit request to push and open a PR.

The commit never reaches the remote default branch, and the working tree's branch never changes — no `git switch`, no `git checkout`, no `git worktree add`. Commit on whatever branch is already checked out; publishing is what keeps the default branch clean.

## 1. Commit

This flow mirrors the host's standard commit workflow, spelled out so it holds identically on every host.

1. Run `git status`, `git diff`, and `git log` in parallel: what changed, what is untracked, and the repository's existing commit message style.
2. Stage only the files related to this intent, by name. Never `git add -A` or `git add .`.
3. Before committing, verify the staged content contains no secrets — `.env` files, private keys, credential files, tokens. If any are staged, stop and report instead of committing. Never create an empty commit.
4. Draft the message in imperative mood, focused on **why** rather than what, matching the repository's existing style (use Conventional Commits only if the repo already does). Carry the reason the change was made, drawn from the current session — never paraphrase the diff.
5. Commit using the HEREDOC pattern, keeping the host's standard attribution trailers unless the user's attribution settings disable them. Never use `--no-verify` or `--no-gpg-sign`; never touch `git config`.
6. If a pre-commit hook fails, retry once. If the hook modified files, amend only when the commit is your own and unpushed.
7. Push only when the user explicitly asked to push — invoking a command whose job includes pushing counts as asking; otherwise default to commit-only. Never `git push --force`, never amend pushed commits, and never use `git reset --hard` to discard work.

## 2. Publish

On a non-default branch:

1. `git push -u origin HEAD` to set the upstream.
2. Open the pull request with `gh pr create`, using a HEREDOC body containing a `## Summary` bullet list explaining why the change was made and a `## Test plan` checklist.

On the default branch (`main`/`master`) the commit is now sitting on the local default branch, so publish it under another name instead:

1. `git branch <name>`, with a descriptive kebab-case name drawn from the change. This only creates a ref — do not check it out.
2. `git push origin <name>`. Never `-u` here: it would repoint the default branch's upstream at `<name>`.
3. `gh pr create --head <name> --base <default>`, with the same HEREDOC body. `--head` is mandatory — `gh` otherwise infers the head from the checked-out branch, which is the default branch.
4. Only if `git status --porcelain` is now empty, run `git reset --hard origin/<default>` so the local default branch matches its remote again. The commit is already safe on `<name>` and on the remote, so nothing is lost. If anything is still pending, skip the reset and report that the local default branch is one commit ahead.

Never `git push --force`.

## 3. Report

The PR URL, the commit message, the branch name, and — when the flow started on the default branch — whether the local default branch was reset or left one commit ahead.
