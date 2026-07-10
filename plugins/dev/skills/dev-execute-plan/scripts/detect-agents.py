#!/usr/bin/env python3
"""Detect external agent CLIs that dev-execute-plan can delegate to.

Subagent delegation (the preferred mode) and self-execution are host
capabilities and are not reported here; this script only covers external CLIs.
The machine-readable output is:

    AGENTS=codex,claude
    AGENTS_UNAUTH=cursor

AGENTS lists CLIs that are installed and have credentials detected;
AGENTS_UNAUTH lists CLIs that are installed but whose credentials were not found.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

HOME = Path.home()

KNOWN_AGENTS = [
    {
        "key": "codex",
        "label": "codex exec",
        "bin": "codex",
        "auth_files": [HOME / ".codex" / "auth.json"],
        "auth_envs": [],
    },
    {
        "key": "cursor",
        "label": "cursor-agent",
        "bin": "cursor-agent",
        "auth_files": [HOME / ".cursor" / "cli-config.json"],
        "auth_envs": ["CURSOR_API_KEY"],
    },
    {
        "key": "claude",
        "label": "claude headless",
        "bin": "claude",
        "auth_files": [HOME / ".claude.json", HOME / ".claude" / ".credentials.json"],
        "auth_envs": ["ANTHROPIC_API_KEY"],
    },
]

OK, NO, WARN = "[ok]", "[no]", "[!]"


def version_line(binary: str) -> str:
    try:
        result = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        out = result.stdout.strip() or result.stderr.strip()
        return out.splitlines()[0].strip() if out else ""
    except Exception:
        return ""


def has_auth(agent: dict) -> bool:
    if any(path.exists() for path in agent["auth_files"]):
        return True
    return any(os.environ.get(name) for name in agent["auth_envs"])


def main() -> None:
    print("dev-execute-plan delegated agent detection")
    print("==========================================")
    print()

    authenticated: list[str] = []
    unauthenticated: list[str] = []

    for agent in KNOWN_AGENTS:
        path = shutil.which(agent["bin"])
        if not path:
            print(f"{NO} {agent['key']:<8} {agent['label']:<15} not installed")
            continue

        version = version_line(agent["bin"])
        version_suffix = f" ({version})" if version else ""
        if has_auth(agent):
            print(f"{OK} {agent['key']:<8} {agent['label']:<15} {path}{version_suffix} authenticated")
            authenticated.append(agent["key"])
        else:
            print(f"{WARN} {agent['key']:<8} {agent['label']:<15} {path}{version_suffix} auth not detected")
            unauthenticated.append(agent["key"])

    print()
    print("AGENTS=" + ",".join(authenticated))
    print("AGENTS_UNAUTH=" + ",".join(unauthenticated))


if __name__ == "__main__":
    main()
