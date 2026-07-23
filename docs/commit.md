# commit

`commit` mirrors the command surface of the official `commit-commands` plugin with one twist: committing, opening PRs, and cleaning up branches are low-difficulty, high-frequency chores, so the main session model never runs them itself. Each skill instructs the orchestrating agent to delegate the whole flow to a subagent running on the host's cheapest available model — a single delegation call in, a commit hash or PR URL out.

The delegation is capability-detected, not platform-hardcoded: on Claude Code the skills use the Agent (Task) tool with `model: haiku`; on Codex they use experimental collab's `spawn_agent` on a cheaper same-provider model, falling back to inline execution when collab is not enabled. Because the subagent has no session context, every delegation prompt must carry a one- or two-sentence summary of *why* the change was made, which the subagent weaves into the commit message and PR description — the one thing that keeps a cheap-model message from degrading into a diff paraphrase.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `commit` | Stage related changes by name, check for staged secrets, and commit following the host's standard commit workflow — message style matched to the repo, attribution trailers respected, hooks never skipped. Push only on explicit request. | A commit on the current branch. |
| `commit-pr` | The full ship-it flow: branch off the default branch if needed, run the same commit flow, push with `-u`, and open a PR with a Summary/Test-plan body via `gh pr create`. | A pull request URL. |
| `commit-clean` | Delete local branches whose upstream is marked `[gone]`, removing their linked worktrees first. Never touches the current or default branch, and reports exactly what was deleted. | A cleaned branch list. |

## Safety rules

All flows share a hard floor, delegated or inline:

- never `git commit --no-verify`, `--no-gpg-sign`, or touch `git config`;
- never `git push --force`, `reset --hard`, or amend pushed commits;
- stage files by name — never `git add -A` / `git add .`;
- stop and report if staged content includes secrets (`.env`, keys, credentials);
- push and PR creation only happen when the invoked flow explicitly includes them;
- `commit-clean` deletes only `[gone]` branches — live or untracked branches are out of scope.

## Example prompts

```text
Commit my changes.
提交代码
Commit, push, and open a PR.
Clean up branches whose remote is gone.
```

## License

MIT
