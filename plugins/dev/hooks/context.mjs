import { execFile } from "node:child_process";
import { open, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const GIT_TIMEOUT_MS = 3000;
const WORKSPACE_SKILLS = new Set(["dev:explore", "dev:write-plan"]);
// The top Claude tier `dev:advisor` dispatches; an orchestrator already there gains nothing from it.
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
    const first = listing.split(/\r?\n/).find((line) => line.startsWith("worktree "))?.slice(9);
    const branch = (await git(execFileImpl, cwd, ["branch", "--show-current"])).trim();
    const [current, main] = await Promise.all([toplevel, first ?? toplevel].map((path) => realpath(path).catch(() => path)));
    const state = { kind: current === main ? "main" : "linked", toplevel: current, main, branch: branch || null };
    if (pending) state.pending = (await git(execFileImpl, cwd, ["status", "--porcelain"])).split(/\r?\n/).filter(Boolean).length;
    return state;
  } catch { return { kind: "unknown" }; }
}

// Facts only, one `key: value` per line; the skills carry the semantics (staleness, fallback, what to do).
function describeWorkspace(cwd, state) {
  const line = (key, value) => `${key}: ${String(value).replace(/[\u0000-\u001f\u007f]/g, "?")}`;
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

// Session start and the two allow-listed skill starts share the same gate; other events inject nothing.
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
  // `at` is either the literal session-start marker or one of the two allow-listed skill names.
  return `<dev-workspace at="${at}">\n${describeWorkspace(cwd, state)}\n</dev-workspace>`;
}

export async function runHook(input, { env = process.env, execFileImpl = execFileAsync } = {}) {
  const gate = input && typeof input === "object" ? skillOf(input) : null;
  if (!gate) return {};
  const event = input.hook_event_name;
  const [principles, workspace, orchestrator] = await Promise.all([
    event === "SessionStart" ? principlesContext(env) : null,
    workspaceContext(input, gate.at, execFileImpl),
    orchestratorContext(input, gate.at)
  ]);
  const parts = [principles, workspace, orchestrator].filter(Boolean);
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
