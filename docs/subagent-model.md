# subagent-model

`subagent-model` is the owner's model-tiering rule for subagents. The default
harness behavior inherits the parent model for every subagent that does not
declare its own, which runs retrieval-grade work on the most expensive tier.
The correction is not "always downgrade" — it is precise downgrading by task
type and result verifiability.

## The rule

Pass an explicit `model` when spawning a subagent. Tiers, high to low:
fable > opus > sonnet > haiku.

| Move | When | Examples |
| --- | --- | --- |
| Drop two or more tiers | Output is mechanically verifiable or trivially checkable | File retrieval, grep sweeps, enumeration, format conversion, bulk mechanical edits |
| Drop one tier | Result matters but errors surface quickly | Self-contained small implementations, summaries, routine exploration |
| Keep the parent tier | Conclusions taken on trust and hard to verify | Design decisions, review verdicts, deep debugging, cross-module implementation |

The judgment key is task type and verifiability, not perceived difficulty.
When unsure, do not downgrade: a trusted wrong conclusion costs more rework
than the tokens saved.

## Components

- **SessionStart hook** (Claude Code only) — injects the rule at the start of
  every session so it applies to each spawn decision without being asked.
- **`subagent-model` skill** — the full framework with its reasons, for
  explicit consultation when deciding a tier.

## Example prompts

```text
Use subagent-model to pick the model tier for this subtask.
Use subagent-model to decide whether this delegation can run on a cheaper tier.
```

## License

MIT
