import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*-executor$/;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const ALIASES = new Set(["inherit", "opus", "sonnet", "haiku", "fable", "opusplan"]);
const SUCCESS_TTL = 5 * 60_000;
const FAILURE_TTL = 30_000;
const CACHE_VERSION = 1;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function overrideStatus(env, model) {
  const value = env.CLAUDE_CODE_SUBAGENT_MODEL;
  if (!value || value === "inherit" || value === model) return null;
  // Before Claude Code 2.1.251 this default overrode frontmatter. Hooks have no host version field.
  return env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE === "1" ? "forced" : "possible";
}

// Only name/model string scalars are needed. Never execute YAML tags or read the body.
function scalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    const match = trimmed.match(/^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/);
    try { return match ? JSON.parse(match[1]) : null; } catch { return null; }
  }
  if (trimmed.startsWith("'")) {
    const match = trimmed.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/);
    return match ? match[1].replaceAll("''", "'") : null;
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function binding(source) {
  const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return null;
  const fields = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^(name|model):[\t ]*(.*)$/);
    if (!match) continue;
    if (Object.hasOwn(fields, match[1])) return null;
    fields[match[1]] = scalar(match[2]);
  }
  if (!NAME.test(fields.name ?? "")) return null;
  return { name: fields.name, model: !Object.hasOwn(fields, "model") ? "inherit" : MODEL.test(fields.model ?? "") ? fields.model : null };
}

async function discover(pluginRoot, configRoot, projectRoot) {
  const agents = new Map();
  for (const [root, prefix] of [
    [join(pluginRoot, "agents"), "dev:"],
    [join(configRoot, "agents"), ""],
    [join(projectRoot, ".claude", "agents"), ""]
  ]) {
    let files;
    try { files = await readdir(root, { withFileTypes: true }); } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile() || !file.name.endsWith(".md")) continue;
      const parsed = binding(await readFile(join(root, file.name), "utf8"));
      if (!parsed) continue;
      const agentType = `${prefix}${parsed.name}`;
      // A project definition replaces a user definition, including a switch to a Claude alias.
      agents.set(agentType, { agentType, model: parsed.model });
    }
  }
  return [...agents.values()].sort((a, b) => a.agentType.localeCompare(b.agentType));
}

function connection(env) {
  const credential = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;
  if (!env.ANTHROPIC_BASE_URL || !credential) return null;
  try {
    const base = new URL(env.ANTHROPIC_BASE_URL);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    base.pathname = base.pathname.replace(/\/$/, "");
    base.pathname += base.pathname.endsWith("/v1") ? "/models" : "/v1/models";
    base.searchParams.set("limit", "1000");
    return {
      url: base,
      headers: {
        "anthropic-version": "2023-06-01",
        ...(env.ANTHROPIC_AUTH_TOKEN ? { Authorization: `Bearer ${credential}` } : { "x-api-key": credential })
      }
    };
  } catch { return null; }
}

async function responseJson(response) {
  // Bound untrusted responses before parsing; neither raw responses nor errors reach context.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) throw new Error("response too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

async function queryModels(config, agents, fetchImpl, requestTimeoutMs) {
  if (!config) return { verified: false, reason: "Relay configuration or credentials are unavailable.", models: [] };
  const url = new URL(config.url);
  const signal = AbortSignal.timeout(requestTimeoutMs);
  const ids = new Set();
  const cursors = new Set();
  try {
    for (let page = 0; page < 20; page++) {
      const response = await fetchImpl(url, { headers: config.headers, signal, redirect: "error" });
      if (!response.ok) throw new Error("request failed");
      const body = await responseJson(response);
      if (!Array.isArray(body.data) || body.data.some((item) => !item || typeof item.id !== "string")) throw new Error("invalid listing");
      for (const { id } of body.data) ids.add(id);
      if (body.has_more === false || body.has_more === undefined) {
        // Unknown pagination must not turn an incomplete list into negative evidence.
        if (body.next || body.next_page || body.next_page_token) throw new Error("unsupported pagination");
        return { verified: true, models: [...new Set(agents.map(({ model }) => model).filter((id) => ids.has(id)))] };
      }
      if (body.has_more !== true || typeof body.last_id !== "string" || !body.last_id || cursors.has(body.last_id)) throw new Error("invalid pagination");
      cursors.add(body.last_id);
      url.searchParams.set("after_id", body.last_id);
    }
  } catch { /* Incomplete listings never prove that a model is unavailable. */ }
  return { verified: false, reason: "Relay model listing could not be verified; check actual routing in relay logs.", models: [] };
}

async function readCache(path, now, agents) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    const age = now() - value.checkedAt;
    const ttl = value.verified ? SUCCESS_TTL : FAILURE_TTL;
    const known = new Set(agents.map(({ model }) => model));
    if (value.version !== CACHE_VERSION || typeof value.verified !== "boolean" || !Number.isFinite(value.checkedAt)
      || age < 0 || age >= ttl || !Array.isArray(value.models) || value.models.some((id) => !known.has(id))) return null;
    // Do not trust strings read from a cache as instructions.
    return { verified: value.verified, checkedAt: value.checkedAt, models: value.models };
  } catch { return null; }
}

async function snapshot({ env, input, agents, config, fetchImpl, now, requestTimeoutMs, configRoot, projectRoot }) {
  const refresh = async () => ({ ...await queryModels(config, agents, fetchImpl, requestTimeoutMs), checkedAt: now() });
  if (!input.session_id) return refresh();
  const cacheRoot = join(env.CLAUDE_PLUGIN_DATA || join(configRoot, "plugins", "data", "dev"), "executor-cache");
  // The filename binds the session, endpoint, credential and definitions without persisting secrets.
  const key = hash(JSON.stringify([CACHE_VERSION, input.session_id, projectRoot, config, agents,
    env.CLAUDE_CODE_SUBAGENT_MODEL, env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE]));
  const path = join(cacheRoot, `${key}.json`);
  const lock = `${path}.lock`;
  const cached = await readCache(path, now, agents);
  if (cached) return cached;
  let locked = false;
  try {
    await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + requestTimeoutMs + 1000;
    while (!locked) {
      try { await mkdir(lock, { mode: 0o700 }); locked = true; } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const shared = await readCache(path, now, agents);
        if (shared) return shared;
        const lockAge = Date.now() - (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
        if (lockAge > 15_000) { await rm(lock, { recursive: true, force: true }); continue; }
        if (Date.now() >= deadline) return { verified: false, models: [], checkedAt: now() };
        await delay(25);
      }
    }
    const shared = await readCache(path, now, agents);
    if (shared) return shared;
    const fresh = await refresh();
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify({ version: CACHE_VERSION, verified: fresh.verified, models: fresh.models, checkedAt: fresh.checkedAt })}\n`, { mode: 0o600 });
      await rename(temporary, path);
    } catch { /* Keep the live result even when persistence is unavailable. */ }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
    return fresh;
  } catch {
    // A read-only or unavailable cache must not prevent a bounded, live check.
    return refresh();
  } finally {
    if (locked) await rm(lock, { recursive: true, force: true }).catch(() => {});
  }
}

function inject(event, text) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

// Every executor message is delimited so the orchestrator can locate it and tell it from repository content.
function context(event, text) {
  return inject(event, `<dev-executors>\n${text}\n</dev-executors>`);
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

const GIT_TIMEOUT_MS = 3000;
const WORKSPACE_SKILLS = new Set(["dev:explore", "dev:write-plan"]);
const execFileAsync = promisify(execFile);

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

async function workspaceContext(input, execFileImpl) {
  const event = input.hook_event_name;
  const skill = event === "PreToolUse" ? input.tool_input?.skill : null;
  if (event === "PreToolUse" && (input.tool_name !== "Skill" || !WORKSPACE_SKILLS.has(skill))) return null;
  const cwd = input.cwd || process.cwd();
  const state = await inspectWorkspace(cwd, execFileImpl, event === "PreToolUse");
  // `at` is either the literal session-start marker or one of the two allow-listed skill names.
  return `<dev-workspace at="${skill ?? "session-start"}">\n${describeWorkspace(cwd, state)}\n</dev-workspace>`;
}

export async function runHook(input, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now, requestTimeoutMs = 3000, execFileImpl = execFileAsync } = {}) {
  const event = input?.hook_event_name;
  if (event === "SessionStart") {
    const [workspace, executors] = await Promise.all([
      workspaceContext(input, execFileImpl),
      executorHook(input, { env, fetchImpl, now, requestTimeoutMs })
    ]);
    const parts = [workspace, executors.hookSpecificOutput?.additionalContext].filter(Boolean);
    return parts.length ? inject(event, parts.join("\n\n")) : {};
  }
  if (event === "PreToolUse" && input.tool_name === "Skill") {
    const workspace = await workspaceContext(input, execFileImpl);
    return workspace ? inject(event, workspace) : {};
  }
  return executorHook(input, { env, fetchImpl, now, requestTimeoutMs });
}

async function executorHook(input, { env, fetchImpl, now, requestTimeoutMs }) {
  const event = input?.hook_event_name;
  const target = input?.tool_input?.subagent_type;
  if (event !== "SessionStart" && event !== "PreToolUse") return {};
  if (event === "PreToolUse" && (input.tool_name !== "Agent" || typeof target !== "string"
    || (!NAME.test(target) && !target.startsWith("dev:")))) return {};
  const pluginRoot = env.CLAUDE_PLUGIN_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const configRoot = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const projectRoot = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const discovered = await discover(pluginRoot, configRoot, projectRoot);
  const selected = discovered.find(({ agentType }) => agentType === target);
  const agents = discovered.filter(({ model }) => !ALIASES.has(model));
  if (event === "PreToolUse") {
    if (!selected) return target.startsWith("dev:") && NAME.test(target.slice(4))
      ? deny("The requested dev executor has no readable pinned definition. Refresh the installed plugin; do not substitute another model.") : {};
    if (ALIASES.has(selected.model)) return {};
    if (!selected.model) return deny("The executor model binding could not be read. Use a literal full model ID in its frontmatter before dispatching.");
    if (Object.hasOwn(input.tool_input, "model")) return deny("Dispatch a model-pinned executor without a model argument; an override replaces its pinned model.");
    if (overrideStatus(env, selected.model) === "forced") return deny("CLAUDE_CODE_SUBAGENT_MODEL_FORCE forces a different model than the selected executor binding. Resolve that override before dispatching.");
  }
  if (!agents.length) return event === "SessionStart" ? context(event, "Dev executor availability: no relay-pinned executor definitions were discovered. Keep the user's execution mode; do not run model discovery from a skill.") : {};
  const state = await snapshot({ env, input, agents, config: connection(env), fetchImpl, now, requestTimeoutMs, configRoot, projectRoot });
  if (event === "PreToolUse") {
    if (state.verified && !state.models.includes(selected.model)) return deny(`Executor ${selected.agentType} is unavailable: its pinned model ${selected.model} is absent from the relay listing. Keep the user's choice and report the failure; do not silently select another model.`);
    if (overrideStatus(env, selected.model) === "possible") return context(event, "Dev executor routing is unverified: CLAUDE_CODE_SUBAGENT_MODEL differs from the pinned model. Claude Code before 2.1.251 lets this variable override frontmatter; newer versions use it as a default unless forced. Check the host version and actual routing. Keep the user's selection and normal permission checks.");
    if (!state.verified) return context(event, "Dev executor availability is unverified because the relay listing could not be checked. The hook does not grant permission or change the selected model. Report this limitation and verify actual routing in relay logs; do not repeat discovery from the skill.");
    return {};
  }
  const lines = agents.map(({ agentType, model }) => {
    const override = overrideStatus(env, model);
    const status = override === "forced" ? "unavailable (forced subagent model override)"
      : !model || !state.verified ? "unverified" : !state.models.includes(model) ? "unavailable"
        : override === "possible" ? "unverified (subagent model default may override on older hosts)" : "verified";
    return `- ${agentType} -> ${model || "unreadable binding"}: ${status}`;
  });
  return context(event, [
    "Dev executor availability (relay listing, not proof of actual serving model):",
    ...lines,
    `Checked at ${new Date(state.checkedAt).toISOString()}; successful checks are cached for 5 minutes, failed checks for 30 seconds.`,
    "These are disk-discovered candidates, not the host's agent registry. Offer only agent types currently available in the host. Keep verified and unverified candidates distinct; never offer unavailable candidates.",
    "Honor the user's recorded executor choice. Dispatch pinned executors without a model argument. PreToolUse checks freshness and blocks known-unavailable bindings; skills must not issue model-list requests.",
    ...(!state.verified ? [state.reason || "The relay listing is unverified; check actual routing in relay logs."] : [])
  ].join("\n"));
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).catch(() => null) === fileURLToPath(import.meta.url)) {
  let input;
  try {
    let raw = "";
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 1_048_576) throw new Error("input too large");
    }
    input = JSON.parse(raw);
    process.stdout.write(`${JSON.stringify(await runHook(input))}\n`);
  } catch {
    // Never echo stdin, credentials, filesystem paths or provider errors.
    const target = input?.tool_input?.subagent_type;
    const output = input?.hook_event_name === "PreToolUse" && input.tool_name === "Agent"
      && typeof target === "string" && target.startsWith("dev:") && NAME.test(target.slice(4))
      ? deny("The executor hook could not read its local configuration. Resolve the hook error before retrying this executor.")
      : context(input?.hook_event_name === "PreToolUse" ? "PreToolUse" : "SessionStart", "Dev executor discovery is unavailable. Treat relay executors as unverified; do not run replacement discovery from a skill.");
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}
