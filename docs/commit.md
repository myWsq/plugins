# commit

`commit` mirrors the command surface of the official `commit-commands` plugin, and pins down the parts that vary between hosts and between sessions: what gets staged, what must never be committed, and where a commit is allowed to land. The three skills share one commit flow, so a commit made by `commit` and a commit made by `commit-pr` are indistinguishable.

`commit-pr` adds one hard constraint: it never switches the working tree's branch. Invoked on a feature branch it pushes with `-u` and opens the PR. Invoked on the default branch it does not check anything out — it records the new commit as a local ref with `git branch <name>`, pushes that ref (without `-u`, which would repoint the default branch's upstream), and opens the PR with an explicit `--head <name>`, since `gh` would otherwise infer the head from the checked-out default branch. If the working tree is clean afterwards, the local default branch is reset to its remote state; the commit is already safe on `<name>` and on the remote, so nothing is discarded. Once the PR merges, `<name>` shows up as `[gone]` and `commit-clean` removes it.

## Skills

| Skill | Purpose | Output |
| --- | --- | --- |
| `commit` | Stage related changes by name, check for staged secrets, and commit following the host's standard commit workflow — message style matched to the repo, attribution trailers respected, hooks never skipped. Push only on explicit request. | A commit on the current branch. |
| `commit-pr` | The full ship-it flow: run the same commit flow, publish the commit as a remote branch without ever checking one out, and open a PR with a Summary/Test-plan body via `gh pr create`. | A pull request URL. |
| `commit-clean` | Delete local branches whose upstream is marked `[gone]`, removing their linked worktrees first. Never touches the current or default branch, and reports exactly what was deleted. | A cleaned branch list. |

## Safety rules

All flows share a hard floor:

- never `git commit --no-verify`, `--no-gpg-sign`, or touch `git config`;
- never `git push --force`, never amend pushed commits, never `git reset --hard` to discard work;
- stage files by name — never `git add -A` / `git add .`;
- stop and report if staged content includes secrets (`.env`, keys, credentials);
- push and PR creation only happen when the invoked flow explicitly includes them;
- no commit ever reaches the remote default branch through `commit-pr`;
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
