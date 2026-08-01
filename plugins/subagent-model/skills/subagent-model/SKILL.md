---
name: subagent-model
description: The owner's subagent model-tiering framework — pass an explicit model when spawning subagents instead of inheriting the parent tier, choosing by task type and result verifiability (mechanically verifiable work drops two or more tiers, self-contained work drops one, trusted-conclusion work keeps the parent tier). Use when spawning or delegating to subagents, or when deciding which model a subtask should run on ("subagent 用什么模型", "选模型档位", "which model for this subtask").
---

# subagent-model

The owner's settled judgment on choosing a model tier for subagents. Like the
`arch` skills, this is a decision framework: defaults with their reasons, so
they can be overridden for a stated cause.

The default harness behavior inherits the parent model for every subagent
that does not declare its own, which runs retrieval-grade work on the most
expensive tier. The correction is not "always downgrade" — it is precise
downgrading by task type.

## The rule

Pass an explicit `model` when spawning a subagent. Tiers, high to low:
fable > opus > sonnet > haiku.

- **Drop two or more tiers** — output is mechanically verifiable or trivially
  checkable: file retrieval, grep sweeps, enumeration, format conversion,
  bulk mechanical edits.
- **Drop one tier** — self-contained small implementations, summaries,
  routine exploration: the result matters but errors surface quickly.
- **Keep the parent tier** — conclusions taken on trust and hard to verify:
  design decisions, review verdicts, deep debugging, cross-module
  implementation.

## Why task type, not difficulty

Perceived difficulty is subjective, and a parent agent systematically
overrates the importance of its own tasks. Task type plus verifiability is
decidable on sight: a wrong grep result is caught the moment it is used, so
haiku is safe; a wrong review verdict is taken on trust and poisons every
decision downstream, so it must not be downgraded.

## Precedence

This framework is the baseline for spawns with no more specific guidance.
When an active skill names a tier for its own delegations, or the user names
a model, that more specific choice wins. Such scenario rules are usually this
framework already applied — e.g. a workflow whose delegated output is fully
verified downstream is the verifiable case, so its fixed downgrade is sound.

## The cost asymmetry

Downgrading saves tokens. A wrong downgrade costs the rework that follows a
trusted wrong conclusion — usually far more than the savings. That asymmetry
sets the tie-breaker: when unsure, do not downgrade.
