---
name: dev-advisor
description: Consult a top-tier read-only advisor before committing to an approach or declaring work done. Use before substantive work on a multi-step task, when stuck with recurring errors or a non-converging approach, when considering a change of approach, or when the user asks for a second opinion on the direction ("问一下 advisor", "找个更强的模型看看", "让 advisor 审一遍这个方案"). The advisor answers; it does not do the work.
---

# dev-advisor

Dispatch the `advisor` subagent — a top-tier reviewer that arrives with fresh
context, reads the code itself rather than your account of it, and answers
without touching the workspace. It advises; you keep doing the work.

Do not pass a `model` when dispatching. The agent pins its own tier in
frontmatter, and a per-invocation override silently replaces it — including the
explicit tier the session-start model-tiering rule asks you to pass.

## When to call

Call **before substantive work** — before writing, before committing to an
interpretation, before building on an assumption. Orientation first is fine:
finding files, reading a source, seeing what is there. Orientation is not
substantive work. Writing, editing, and declaring an answer are.

Also call:

- When the work looks complete, before declaring it done.
- When stuck: errors recurring, approach not converging, results that do not fit.
- When considering a change of approach.

On tasks longer than a few steps, call at least once before committing to an
approach and once before declaring done. A task that is one edit and one check
gets no call at all. On short reactive tasks where the next action follows from
tool output you just read, the first call — before the approach crystallizes —
is the only one worth making.

## What to pass

The advisor does not see this conversation. State the problem, the constraints
the user gave, what you intend to do and why, and the specific question — "does
this hold", "what breaks first", "is there a shorter path". Not "any thoughts".

Point at the code rather than summarizing it; the advisor reads the repository
itself. Paste exact output for anything contested — a failing error, a config
value — never a paraphrase of it. Never paste secrets; cite `file:line` and the
credential type.

With uncommitted work in the tree, include `git status --short`. It tells the
advisor what is in flight, so it has no reason to go hunting for the "before"
state itself.

## What to do with the answer

Give the advice serious weight. Adapt it when a step fails empirically, or when
you have primary-source evidence contradicting a specific claim (the file says
X, the paper states Y). A passing self-test is not evidence the advice is
wrong unless the test actually checks what the advice checks.

If your retrieved data points one way and the advisor points another, do not
silently switch. Surface the conflict in one more call: "I found X, you suggest
Y, which constraint breaks the tie?" If you never passed that evidence, pass it
now; if you did, it may have been underweighted. Carry the advisor's previous
answer into the new brief — a reconcile call is cheaper than committing to the
wrong branch.

Relay what the advisor changed in your plan — the user cannot see its report.
