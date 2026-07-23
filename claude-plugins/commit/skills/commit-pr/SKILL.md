---
name: commit-pr
description: Delegate the full commit → push → pull-request flow to a cheap subagent. Use when the user asks to open a PR, ship changes as a pull request, or says things like "open a PR", "commit and open a PR", "提交并开 PR". The main model must not run git or gh itself; it delegates the whole flow to a subagent running on the host's cheapest available model and relays the PR URL.
---

# commit-pr

The full ship-it flow — branch, commit, push, open a pull request — is mechanical work that should not burn tokens on the session's main (most expensive) model. Invoking this command is the explicit request to push and open a PR.

## Delegate, don't execute

If the host exposes a subagent-spawning capability, you MUST delegate the entire flow to a subagent running on the host's cheapest available model. Do not run git or `gh` commands yourself. Only when the host has no such capability do you fall back to running the flow inline, following the exact same rules.

The delegation prompt MUST include a one- or two-sentence summary of the intent behind this change — why it was made, drawn from the current session — and instruct the subagent to weave that intent into the commit message (and the PR description, when one is created). Without it the subagent has no session context and the output degrades into a diff paraphrase; the intent summary is the one thing that keeps a cheap-model result useful.

Use the Agent (Task) tool with `model` set to `haiku` (the cheapest Claude model) to run the flow below.

## The flow (subagent, or inline fallback)

If currently on the default branch (`main`/`master`), create a descriptively named branch before committing — never commit directly to the default branch in this flow.

Then commit:

This flow mirrors the host's standard commit workflow — the same rules the main agent would apply — so delegating changes who runs it, not how it behaves.

1. Run `git status`, `git diff`, and `git log` in parallel: what changed, what is untracked, and the repository's existing commit message style.
2. Stage only the files related to this intent, by name. Never `git add -A` or `git add .`.
3. Before committing, verify the staged content contains no secrets — `.env` files, private keys, credential files, tokens. If any are staged, stop and report instead of committing. Never create an empty commit.
4. Draft the message the way the host's main agent would: imperative mood, focused on **why** rather than what, matching the repository's existing style (use Conventional Commits only if the repo already does). Weave in the provided intent summary.
5. Commit using the HEREDOC pattern, keeping the host's standard attribution trailers unless the user's attribution settings disable them. Never use `--no-verify` or `--no-gpg-sign`; never touch `git config`.
6. If a pre-commit hook fails, retry once. If the hook modified files, amend only when the commit is your own and unpushed.
7. Push only when the user explicitly asked to push — invoking a command whose job includes pushing counts as asking; otherwise default to commit-only. Never `git push --force`, `reset --hard`, or amend pushed commits.

Then publish:

1. Push the branch with `-u` to set the upstream. Never `git push --force`.
2. Open the pull request with `gh pr create`, using a HEREDOC body containing a `## Summary` bullet list that reflects the intent summary and a `## Test plan` checklist.
3. Relay the PR URL, the commit message, and the branch name back to the user.
