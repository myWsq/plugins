---
name: commit
description: Commit and push with a fixed safety floor — stage by name, refuse staged secrets, match the repository's message style. Use when the user asks to commit, save, or push code (e.g. "commit this", "提交代码", "push my changes").
---

# commit

Committing and pushing run the same flow every time: stage only what belongs to this change, refuse to commit secrets, and write a message that explains why.

## The commit flow

This flow mirrors the host's standard commit workflow, spelled out so it holds identically on every host.

1. Run `git status`, `git diff`, and `git log` in parallel: what changed, what is untracked, and the repository's existing commit message style.
2. Stage only the files related to this intent, by name. Never `git add -A` or `git add .`.
3. Before committing, verify the staged content contains no secrets — `.env` files, private keys, credential files, tokens. If any are staged, stop and report instead of committing. Never create an empty commit.
4. Draft the message in imperative mood, focused on **why** rather than what, matching the repository's existing style (use Conventional Commits only if the repo already does). Carry the reason the change was made, drawn from the current session — never paraphrase the diff.
5. Commit using the HEREDOC pattern, keeping the host's standard attribution trailers unless the user's attribution settings disable them. Never use `--no-verify` or `--no-gpg-sign`; never touch `git config`.
6. If a pre-commit hook fails, retry once. If the hook modified files, amend only when the commit is your own and unpushed.
7. Push only when the user explicitly asked to push — invoking a command whose job includes pushing counts as asking; otherwise default to commit-only. Never `git push --force`, never amend pushed commits, and never use `git reset --hard` to discard work.

Report the commit message, the hash, and whether it was pushed.
