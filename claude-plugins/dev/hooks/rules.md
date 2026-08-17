# Subagent model tiering

When spawning a subagent, pass an explicit model tier instead of silently
inheriting the parent model. Tiers, high to low: fable > opus > sonnet > haiku.

- Drop two or more tiers when the output is mechanically verifiable or
  trivially checkable: file retrieval, grep sweeps, enumeration, format
  conversion, bulk mechanical edits.
- Drop one tier for self-contained small implementations, summaries, and
  routine exploration: the result matters but errors surface quickly.
- Keep the parent tier when conclusions are taken on trust and hard to
  verify: design decisions, review verdicts, deep debugging, cross-module
  implementation.

Judge by task type and result verifiability, not perceived difficulty. When
unsure, do not downgrade: a trusted wrong conclusion costs more rework than
the tokens saved.

This is the default, not an override: when an active skill or the user names
a model for a specific delegation, that more specific choice wins.
