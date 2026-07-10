#!/usr/bin/env python3
"""Dispatch a prompt file to a delegated agent CLI.

The caller provides:

    dispatch.py <agent> <repo-root> <prompt-file> [model]

All fixed flags for permissions, working directory, and output mode are handled here.
The delegated agent works in the current repository and is expected to modify code and commit.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path


def die(message: str) -> None:
    print(f"dispatch.py: {message}", file=sys.stderr)
    raise SystemExit(2)


def run_agent(cmd: list[str], cwd: str | None = None) -> int:
    """Run the agent in its own process group and forward termination signals,
    so killing dispatch.py also stops the delegated agent instead of orphaning it."""
    proc = subprocess.Popen(cmd, cwd=cwd, start_new_session=True)

    def forward(signum: int, _frame: object) -> None:
        try:
            os.killpg(proc.pid, signum)
        except (ProcessLookupError, PermissionError):
            pass

    signals = [signal.SIGINT, signal.SIGTERM]
    if hasattr(signal, "SIGHUP"):
        signals.append(signal.SIGHUP)
    for sig in signals:
        signal.signal(sig, forward)

    return proc.wait()


def run_codex(repo: str, prompt: str, model: str) -> int:
    if not shutil.which("codex"):
        die("codex is not installed or not on PATH")
    cmd = [
        "codex",
        "exec",
        prompt,
        "-C",
        repo,
        "--dangerously-bypass-approvals-and-sandbox",
    ]
    if model:
        cmd += ["-m", model]
    return run_agent(cmd)


def run_cursor(repo: str, prompt: str, model: str) -> int:
    if not shutil.which("cursor-agent"):
        die("cursor-agent is not installed or not on PATH")
    cmd = ["cursor-agent", "-p", prompt, "--workspace", repo]
    if model:
        cmd += ["-m", model]
    cmd += ["--output-format", "text", "--yolo"]
    return run_agent(cmd)


def run_claude(repo: str, prompt: str, model: str) -> int:
    if not shutil.which("claude"):
        die("claude is not installed or not on PATH")
    cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions"]
    if model:
        cmd += ["--model", model]
    return run_agent(cmd, cwd=repo)


AGENTS = {
    "codex": run_codex,
    "cursor": run_cursor,
    "claude": run_claude,
}


def main(argv: list[str]) -> None:
    if len(argv) < 3:
        die("usage: dispatch.py <agent> <repo-root> <prompt-file> [model]")

    agent, repo, prompt_file = argv[0], argv[1], argv[2]
    model = argv[3] if len(argv) > 3 else ""

    if not Path(repo).is_dir():
        die(f"repository directory does not exist: {repo}")
    if not Path(prompt_file).is_file():
        die(f"prompt file does not exist: {prompt_file}")

    handler = AGENTS.get(agent)
    if handler is None:
        die(f"unknown agent: {agent} (supported: {', '.join(AGENTS)})")

    prompt = Path(prompt_file).read_text(encoding="utf-8")
    raise SystemExit(handler(repo, prompt, model))


if __name__ == "__main__":
    main(sys.argv[1:])
