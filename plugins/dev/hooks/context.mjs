import { execFile } from "node:child_process";
import { open, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const GIT_TIMEOUT_MS = 3000;
// `gh auth status` verifies the token over the network; the hook's own budget is 10 seconds.
const GH_TIMEOUT_MS = 5000;
const WORKSPACE_SKILLS = new Set(["dev:explore", "dev:write-plan", "dev:execute-plan"]);
const ORCHESTRATOR_SKILLS = new Set(["dev:explore", "dev:write-plan"]);
const PUBLISH_SKILL = "dev:execute-plan";
// A long execution may compact or resume before it closes; the verdict must be there at close.
const PUBLISH_RESTARTS = new Set(["compact", "resume"]);
const HOST = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,252}[a-zA-Z0-9])?$/;
// The top Claude tier the plan audit dispatches; an orchestrator already there gains nothing from it.
const TOP_TIER = /fable/i;
const TRANSCRIPT_TAIL_BYTES = 512 * 1024;
const execFileAsync = promisify(execFile);

function inject(event, text) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

function pluginRootOf(env) {
  return env.CLAUDE_PLUGIN_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

// The shipped working principles apply to every task, so they ride along with each session start (startup, resume, clear, compact).
async function principlesContext(env) {
  try {
    const text = (await readFile(join(pluginRootOf(env), "hooks", "principles.md"), "utf8")).trim();
    return text ? `<dev-principles>\n${text}\n</dev-principles>` : null;
  } catch {
    // A missing or unreadable file drops the block; it never blocks the session or the other snapshots.
    return null;
  }
}

async function git(execFileImpl, cwd, args) {
  const { stdout } = await execFileImpl("git", ["-C", cwd, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1_048_576,
    windowsHide: true
  });
  return String(stdout);
}

// Reads the session's own cwd: CLAUDE_PROJECT_DIR stays at the launch directory after a worktree switch.
async function inspectWorkspace(cwd, execFileImpl, pending) {
  let toplevel;
  try {
    toplevel = (await git(execFileImpl, cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch (error) {
    // git exits non-zero outside a repository; a missing binary or a timeout proves nothing.
    return { kind: typeof error?.code === "number" ? "none" : "unknown" };
  }
  try {
    const listing = await git(execFileImpl, cwd, ["worktree", "list", "--porcelain"]);
    // The first stanza is the main worktree; its `branch` line is absent when it is detached.
    const stanza = listing.split(/\r?\n/);
    const end = stanza.indexOf("", 1);
    const mainLines = end === -1 ? stanza : stanza.slice(0, end);
    const first = mainLines.find((line) => line.startsWith("worktree "))?.slice(9);
    const mainBranch = mainLines.find((line) => line.startsWith("branch refs/heads/"))?.slice(18) ?? null;
    const branch = (await git(execFileImpl, cwd, ["branch", "--show-current"])).trim();
    const [current, main] = await Promise.all([toplevel, first ?? toplevel].map((path) => realpath(path).catch(() => path)));
    const state = { kind: current === main ? "main" : "linked", toplevel: current, main, branch: branch || null, mainBranch };
    if (pending) state.pending = (await git(execFileImpl, cwd, ["status", "--porcelain"])).split(/\r?\n/).filter(Boolean).length;
    return state;
  } catch { return { kind: "unknown" }; }
}

// One `key: value` fact per line; control characters cannot break out of it.
function line(key, value) {
  return `${key}: ${String(value).replace(/[\u0000-\u001f\u007f]/g, "?")}`;
}

// Facts only; the skills carry the semantics (staleness, fallback, what to do).
function describeWorkspace(cwd, state) {
  const lines = [line("kind", state.kind)];
  if (state.kind === "main" || state.kind === "linked") {
    lines.push(line("path", state.toplevel));
    if (state.kind === "linked") lines.push(line("main", state.main));
    lines.push(line("branch", state.branch ?? "(detached HEAD)"));
    if (Object.hasOwn(state, "pending")) lines.push(line("pending", state.pending));
  } else if (state.kind === "none") lines.push(line("cwd", cwd));
  else lines.push(line("reason", "git could not be run"));
  return lines.join("\n");
}

// The last model that answered in the transcript: the hook input only names the model at
// session start, and `/model` can change it later. The file may lag the current turn, so
// this is the model of the previous turn at worst — accurate enough for a tier check.
async function transcriptModel(path) {
  if (typeof path !== "string" || !path) return null;
  let handle;
  try {
    handle = await open(path, "r");
    const size = (await handle.stat()).size;
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    if (length < size) lines.shift();
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!lines[i].includes('"assistant"')) continue;
      try {
        const entry = JSON.parse(lines[i]);
        const model = entry?.type === "assistant" ? entry.message?.model : undefined;
        if (typeof model === "string" && MODEL.test(model)) return model;
      } catch {
        // A torn or foreign line: keep scanning backwards.
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

// Session start and the allow-listed skill starts share the same gate; other events inject nothing.
function skillOf(input) {
  const event = input.hook_event_name;
  if (event === "SessionStart") return { at: "session-start", skill: null };
  const skill = input.tool_input?.skill;
  if (event === "PreToolUse" && input.tool_name === "Skill" && WORKSPACE_SKILLS.has(skill)) return { at: skill, skill };
  return null;
}

async function orchestratorContext(input, at) {
  const declared = input.hook_event_name === "SessionStart" && typeof input.model === "string" && MODEL.test(input.model) ? input.model : null;
  const model = declared ?? await transcriptModel(input.transcript_path);
  if (!model) return null;
  return `<dev-orchestrator at="${at}">\nmodel: ${model}\ntop-tier: ${TOP_TIER.test(model) ? "yes" : "no"}\n</dev-orchestrator>`;
}

async function workspaceContext(input, at, execFileImpl) {
  const cwd = input.cwd || process.cwd();
  const state = await inspectWorkspace(cwd, execFileImpl, input.hook_event_name === "PreToolUse");
  // `at` is either the literal session-start marker or one of the allow-listed skill names.
  return { cwd, state, text: `<dev-workspace at="${at}">\n${describeWorkspace(cwd, state)}\n</dev-workspace>` };
}

// The host of `scheme://[user@]host[:port]/path` or scp-like `[user@]host:path`; a local path has none.
function remoteHost(url) {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?([^/:]*)/i.exec(url);
  const host = scheme ? (scheme[1].toLowerCase() === "file" ? null : scheme[2]) : /^(?:[^@/:]+@)?([^/:]{2,}):/.exec(url)?.[1];
  return host && HOST.test(host) ? host.toLowerCase() : null;
}

async function gh(execFileImpl, cwd, args) {
  await execFileImpl("gh", args, {
    cwd,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_SPINNER_DISABLED: "1", NO_COLOR: "1" },
    timeout: GH_TIMEOUT_MS,
    maxBuffer: 1_048_576,
    windowsHide: true
  });
}

// Whether the finished run can open a pull request, checked here so the skill never probes it.
// The base is what the main worktree's branch tracks: the linked branch was cut from its HEAD.
async function inspectPublish(cwd, state, execFileImpl) {
  if (state.kind !== "linked") return { reason: { main: "not in a linked worktree", none: "not in a git repository" }[state.kind] ?? "git could not be run" };
  if (!state.branch) return { reason: "detached HEAD" };
  if (!state.mainBranch) return { reason: "main worktree is on a detached HEAD" };
  let remote;
  let base;
  let host;
  try {
    const upstream = (await git(execFileImpl, cwd, ["for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", `refs/heads/${state.mainBranch}`])).trim();
    [remote, base] = upstream.split("\0");
    base = base?.startsWith("refs/heads/") ? base.slice(11) : "";
    if (!remote || !base) return { reason: `main worktree branch ${state.mainBranch} tracks no remote branch` };
    host = remoteHost((await git(execFileImpl, cwd, ["remote", "get-url", "--push", remote])).trim());
  } catch {
    return { reason: "git could not be run" };
  }
  if (!host) return { reason: `remote ${remote} has no network host` };
  try {
    await gh(execFileImpl, cwd, ["auth", "status", "--hostname", host]);
  } catch (error) {
    if (error?.code === "ENOENT") return { reason: "gh is not installed" };
    return { reason: typeof error?.code === "number" ? `gh is not authenticated for ${host}` : "gh auth status could not be run" };
  }
  return { remote, host, base };
}

async function publishContext(workspace, at, execFileImpl) {
  const result = await inspectPublish(workspace.cwd, workspace.state, execFileImpl);
  const lines = result.reason
    ? [line("pr", "unavailable"), line("reason", result.reason)]
    : [line("pr", "available"), line("remote", result.remote), line("host", result.host), line("base", result.base)];
  return `<dev-publish at="${at}">\n${lines.join("\n")}\n</dev-publish>`;
}

export async function runHook(input, { env = process.env, execFileImpl = execFileAsync } = {}) {
  const gate = input && typeof input === "object" ? skillOf(input) : null;
  if (!gate) return {};
  const event = input.hook_event_name;
  const [principles, workspace, orchestrator] = await Promise.all([
    event === "SessionStart" ? principlesContext(env) : null,
    workspaceContext(input, gate.at, execFileImpl),
    gate.skill === null || ORCHESTRATOR_SKILLS.has(gate.skill) ? orchestratorContext(input, gate.at) : null
  ]);
  const republish = event === "SessionStart" && PUBLISH_RESTARTS.has(input.source) && workspace.state.kind === "linked";
  const publish = gate.skill === PUBLISH_SKILL || republish ? await publishContext(workspace, gate.at, execFileImpl) : null;
  const parts = [principles, workspace.text, orchestrator, publish].filter(Boolean);
  return parts.length ? inject(event, parts.join("\n\n")) : {};
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  try {
    let raw = "";
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 1_048_576) throw new Error("input too large");
    }
    process.stdout.write(`${JSON.stringify(await runHook(JSON.parse(raw)))}\n`);
  } catch {
    // Never echo stdin or filesystem paths; a failed snapshot injects nothing and blocks nothing.
    process.stdout.write("{}\n");
  }
}
