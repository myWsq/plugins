import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

const X_OK = 1;
const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "timed_out"]);
const NESTING_ENVIRONMENT_KEYS = Object.freeze([
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CODEX_CI",
  "CODEX_THREAD_ID",
  "CURSOR_AGENT",
  "CURSOR_AGENT_CLI_LOCAL_MODE",
  "CURSOR_AGENT_WORKER_ID",
  "CURSOR_CLI",
  "CURSOR_CONVERSATION_ID"
]);

export const AGENT_IDS = Object.freeze(["codex", "claude", "cursor"]);

const ADAPTERS = Object.freeze({
  codex: {
    executable: "codex",
    executionMode: "full_access_unattended",
    fullAccess: true,
    runArgs({ cwd, model }) {
      const args = [
        "exec",
        "-",
        "-C",
        cwd,
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "--json"
      ];
      if (model) args.push("-m", model);
      return args;
    }
  },
  claude: {
    executable: "claude",
    executionMode: "full_access_unattended",
    fullAccess: true,
    runArgs({ model }) {
      const args = [
        "-p",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        "--output-format",
        "stream-json",
        "--verbose"
      ];
      if (model) args.push("--model", model);
      return args;
    }
  },
  cursor: {
    executable: "cursor-agent",
    executionMode: "workspace_sandbox_unattended",
    fullAccess: false,
    runArgs({ model }) {
      const args = [
        "-p",
        "--yolo",
        "--sandbox",
        "enabled",
        "--output-format",
        "stream-json",
        "--trust"
      ];
      if (model) args.push("--model", model);
      return args;
    }
  }
});

export class BrokerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
  }
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BrokerError("invalid_arguments", `${name} must be an object`);
  }
  return value;
}

function assertAllowedKeys(value, allowedKeys) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new BrokerError("invalid_arguments", `Unexpected argument: ${unexpected[0]}`);
  }
}

function assertString(value, name, { maxLength = 1_048_576, optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new BrokerError("invalid_arguments", `${name} must be a non-empty string`);
  }
  if (value.length > maxLength || value.includes("\0")) {
    throw new BrokerError("invalid_arguments", `${name} is invalid or too long`);
  }
  return value;
}

function assertInteger(value, name, { min, max, defaultValue }) {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BrokerError(
      "invalid_arguments",
      `${name} must be an integer between ${min} and ${max}`
    );
  }
  return value;
}

function assertModel(value) {
  const model = assertString(value, "model", { maxLength: 200, optional: true });
  if (model === undefined) return undefined;
  if (model.startsWith("-") || /[\u0000-\u001f\u007f]/u.test(model)) {
    throw new BrokerError(
      "invalid_arguments",
      "model must not start with '-' or contain control characters"
    );
  }
  return model;
}

function publicRun(run, events = []) {
  return {
    run_id: run.id,
    agent_id: run.agent,
    cwd: run.cwd,
    status: run.status,
    execution_mode: run.executionMode,
    full_access: run.fullAccess,
    started_at: run.startedAt,
    ...(run.finishedAt ? { finished_at: run.finishedAt } : {}),
    ...(run.exitCode !== undefined ? { exit_code: run.exitCode } : {}),
    ...(run.signal ? { signal: run.signal } : {}),
    ...(run.error ? { error: run.error } : {}),
    events
  };
}

function safeEnvironment(environment, pathValue) {
  const result = { ...environment, PATH: pathValue };
  for (const key of NESTING_ENVIRONMENT_KEYS) delete result[key];
  return result;
}

async function isExecutable(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(adapter, id, environment, home, pathValue) {
  const override = environment[`DEV_AGENT_${id.toUpperCase()}_PATH`];
  if (override !== undefined) {
    if (!isAbsolute(override) || !(await isExecutable(override))) {
      return { path: null, error: `DEV_AGENT_${id.toUpperCase()}_PATH is not an executable absolute path` };
    }
    return { path: await realpath(override), error: null };
  }

  const searchDirectories = pathValue.split(delimiter).filter(Boolean);
  const localBin = join(home, ".local", "bin");
  if (!searchDirectories.includes(localBin)) searchDirectories.push(localBin);

  for (const directory of searchDirectories) {
    const candidate = resolve(directory, adapter.executable);
    if (await isExecutable(candidate)) return { path: await realpath(candidate), error: null };
  }
  return { path: null, error: null };
}

function terminateProcessGroup(child, signal = "SIGTERM") {
  if (!child || child.pid === undefined) return false;
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH" && error?.code !== "EINVAL" && error?.code !== "ENOSYS") {
      return false;
    }
  }
  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

function captureCommand(executable, args, { cwd, environment, timeoutMs, maxBytes = 32_768 }) {
  return new Promise((resolveResult) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env: environment,
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolveResult({ code: null, signal: null, stdout: "", stderr: "", error, timedOut: false });
      return;
    }

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;

    const append = (current, chunk) => {
      if (current.length >= maxBytes) return current;
      return Buffer.concat([current, chunk.subarray(0, maxBytes - current.length)]);
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessGroup(child, "SIGKILL");
    }, timeoutMs);
    timer.unref?.();

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        ...result,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut
      });
    };

    child.once("error", (error) => {
      settle({ code: null, signal: null, error });
    });
    child.once("close", (code, signal) => {
      settle({ code, signal, error: null });
    });
  });
}

function makeLineCollector(onLine, maxLineBytes) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let pendingBytes = 0;
  let discarding = false;

  const consume = (text) => {
    for (const character of text) {
      if (character === "\n") {
        if (!discarding && pending.endsWith("\r")) pending = pending.slice(0, -1);
        if (!discarding || pending) onLine(pending);
        pending = "";
        pendingBytes = 0;
        discarding = false;
        continue;
      }
      if (discarding) continue;
      pending += character;
      pendingBytes += Buffer.byteLength(character);
      if (pendingBytes > maxLineBytes) {
        onLine(`${pending.slice(0, maxLineBytes)}…[truncated]`);
        pending = "";
        pendingBytes = 0;
        discarding = true;
      }
    }
  };

  return {
    push(chunk) {
      consume(decoder.write(chunk));
    },
    end() {
      consume(decoder.end());
      if (!discarding && pending) onLine(pending);
      pending = "";
      pendingBytes = 0;
    }
  };
}

export function createBroker(options = {}) {
  const environment = options.env ?? process.env;
  const home = options.home ?? homedir();
  const basePath = environment.PATH ?? "";
  const localBin = join(home, ".local", "bin");
  const pathParts = basePath.split(delimiter).filter(Boolean);
  if (!pathParts.includes(localBin)) pathParts.push(localBin);
  const pathValue = pathParts.join(delimiter);
  const childEnvironment = safeEnvironment(environment, pathValue);
  const gitTimeoutMs = options.gitTimeoutMs ?? 5_000;
  const defaultRunTimeoutMs = options.defaultRunTimeoutMs ?? 30 * 60_000;
  const maxRunTimeoutMs = options.maxRunTimeoutMs ?? 4 * 60 * 60_000;
  const maxEvents = options.maxEvents ?? 1_000;
  const maxEventBytes = options.maxEventBytes ?? 1_048_576;
  const maxLineBytes = options.maxLineBytes ?? 65_536;
  const maxRetainedRuns = options.maxRetainedRuns ?? 100;
  const killGraceMs = options.killGraceMs ?? 2_000;
  const runs = new Map();
  const busyWorktrees = new Map();
  let pinnedCommonDir = null;
  let startQueue = Promise.resolve();

  const withStartLock = (operation) => {
    const next = startQueue.then(operation, operation);
    startQueue = next.catch(() => {});
    return next;
  };

  async function detectAgent(id) {
    const adapter = ADAPTERS[id];
    if (!adapter) {
      throw new BrokerError("unknown_agent", `Unsupported agent: ${id}`);
    }
    const resolution = await resolveExecutable(adapter, id, environment, home, pathValue);
    if (!resolution.path) {
      return {
        id,
        status: "unavailable",
        installed: false,
        available: false,
        execution_mode: adapter.executionMode,
        full_access_only: adapter.fullAccess,
        ...(resolution.error ? { error: resolution.error } : {})
      };
    }

    return {
      id,
      status: "ready",
      installed: true,
      available: true,
      execution_mode: adapter.executionMode,
      full_access_only: adapter.fullAccess,
      path: resolution.path
    };
  }

  async function agentsList(rawArguments = {}) {
    const input = assertObject(rawArguments, "arguments");
    assertAllowedKeys(input, []);
    return {
      execution_mode: "fixed_unattended",
      consent_required: true,
      agents: await Promise.all(AGENT_IDS.map((id) => detectAgent(id)))
    };
  }

  async function runGit(cwd, args) {
    const result = await captureCommand("git", ["-C", cwd, ...args], {
      cwd,
      environment: childEnvironment,
      timeoutMs: gitTimeoutMs
    });
    if (result.timedOut) {
      throw new BrokerError("invalid_cwd", "Git worktree validation timed out");
    }
    if (result.error || result.code !== 0) {
      throw new BrokerError("invalid_cwd", "cwd must be a valid Git worktree");
    }
    return result.stdout.trim();
  }

  async function validateWorktree(inputCwd) {
    assertString(inputCwd, "cwd", { maxLength: 16_384 });
    if (!isAbsolute(inputCwd)) {
      throw new BrokerError("invalid_cwd", "cwd must be an absolute path");
    }
    let cwd;
    try {
      cwd = await realpath(inputCwd);
      if (!(await stat(cwd)).isDirectory()) throw new Error("not a directory");
    } catch {
      throw new BrokerError("invalid_cwd", "cwd must be an existing directory");
    }

    if ((await runGit(cwd, ["rev-parse", "--is-inside-work-tree"])) !== "true") {
      throw new BrokerError("invalid_cwd", "cwd must be inside a Git worktree");
    }
    const topLevel = await realpath(await runGit(cwd, ["rev-parse", "--show-toplevel"]));
    if (topLevel !== cwd) {
      throw new BrokerError("invalid_cwd", "cwd must be the Git worktree root");
    }
    const commonDirOutput = await runGit(cwd, ["rev-parse", "--git-common-dir"]);
    const commonDir = await realpath(
      isAbsolute(commonDirOutput) ? commonDirOutput : resolve(cwd, commonDirOutput)
    );
    return { cwd, commonDir };
  }

  function appendEvent(run, stream, data) {
    const event = {
      seq: run.nextSequence++,
      stream,
      data,
      at: new Date().toISOString()
    };
    const size = Buffer.byteLength(data);
    run.events.push({ ...event, size });
    run.eventBytes += size;
    while (run.events.length > maxEvents || run.eventBytes > maxEventBytes) {
      const removed = run.events.shift();
      if (!removed) break;
      run.eventBytes -= removed.size;
    }
    for (const notify of run.waiters) notify();
    run.waiters.clear();
  }

  function clearBusy(run) {
    if (busyWorktrees.get(run.cwd) === run.id) busyWorktrees.delete(run.cwd);
  }

  function pruneFinishedRuns() {
    const finished = [...runs.values()]
      .filter((run) => run.closed)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    while (finished.length > Math.max(1, maxRetainedRuns)) {
      runs.delete(finished.shift().id);
    }
  }

  function requestTermination(run, reason) {
    if (TERMINAL_STATUSES.has(run.status)) return false;
    if (run.terminationReason) return false;
    run.terminationReason = reason;
    if (reason === "timeout") run.status = "timing_out";
    else if (reason === "cancel") run.status = "canceling";
    terminateProcessGroup(run.child, "SIGTERM");
    if (!run.killTimer) {
      run.killTimer = setTimeout(() => {
        if (!run.closed) terminateProcessGroup(run.child, "SIGKILL");
      }, killGraceMs);
      run.killTimer.unref?.();
    }
    for (const notify of run.waiters) notify();
    run.waiters.clear();
    return true;
  }

  function launchRun({
    id,
    agent,
    cwd,
    executable,
    args,
    prompt,
    timeoutMs,
    executionMode,
    fullAccess
  }) {
    const run = {
      id,
      agent,
      cwd,
      executionMode,
      fullAccess,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: undefined,
      signal: null,
      error: null,
      events: [],
      eventBytes: 0,
      nextSequence: 1,
      waiters: new Set(),
      child: null,
      timeoutTimer: null,
      killTimer: null,
      terminationReason: null,
      closed: false
    };
    runs.set(id, run);
    busyWorktrees.set(cwd, id);

    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env: childEnvironment,
        detached: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch {
      run.status = "failed";
      run.error = "Agent process could not be started";
      run.finishedAt = new Date().toISOString();
      run.closed = true;
      clearBusy(run);
      appendEvent(run, "system", "Agent process failed to start");
      pruneFinishedRuns();
      return run;
    }
    run.child = child;
    appendEvent(run, "system", `Agent process started in ${executionMode} mode`);

    const stdout = makeLineCollector((line) => appendEvent(run, "stdout", line), maxLineBytes);
    const stderr = makeLineCollector((line) => appendEvent(run, "stderr", line), maxLineBytes);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);

    run.timeoutTimer = setTimeout(() => requestTermination(run, "timeout"), timeoutMs);
    run.timeoutTimer.unref?.();

    child.once("error", () => {
      if (!run.error) run.error = "Agent process failed";
    });
    child.once("close", (code, signal) => {
      if (run.closed) return;
      run.closed = true;
      clearTimeout(run.timeoutTimer);
      clearTimeout(run.killTimer);
      stdout.end();
      stderr.end();
      run.exitCode = code;
      run.signal = signal;
      run.finishedAt = new Date().toISOString();
      if (run.terminationReason === "timeout") run.status = "timed_out";
      else if (run.terminationReason === "cancel") run.status = "canceled";
      else if (run.error || code !== 0) {
        run.status = "failed";
        if (!run.error) run.error = `Agent exited with code ${code}`;
      } else run.status = "completed";
      clearBusy(run);
      appendEvent(run, "system", `Agent process ${run.status}`);
      pruneFinishedRuns();
    });
    return run;
  }

  async function delegateStart(rawArguments) {
    const input = assertObject(rawArguments, "arguments");
    assertAllowedKeys(input, [
      "agent_id",
      "cwd",
      "prompt",
      "model",
      "timeout_ms",
      "confirmed_unattended"
    ]);
    if (input.confirmed_unattended !== true) {
      throw new BrokerError(
        "unattended_confirmation_required",
        "confirmed_unattended=true is required; Codex and Claude bypass sandboxing while Cursor retains its workspace sandbox"
      );
    }
    const agent = assertString(input.agent_id, "agent_id", { maxLength: 32 });
    if (!AGENT_IDS.includes(agent)) {
      throw new BrokerError("unknown_agent", `Unsupported agent: ${agent}`);
    }
    const prompt = assertString(input.prompt, "prompt");
    const model = assertModel(input.model);
    const timeoutMs = assertInteger(input.timeout_ms, "timeout_ms", {
      min: 1,
      max: maxRunTimeoutMs,
      defaultValue: defaultRunTimeoutMs
    });

    return withStartLock(async () => {
      const detected = await detectAgent(agent);
      if (!detected.available) {
        throw new BrokerError("agent_unavailable", `${agent} is not installed`);
      }
      const worktree = await validateWorktree(input.cwd);
      if (pinnedCommonDir && worktree.commonDir !== pinnedCommonDir) {
        throw new BrokerError(
          "repository_mismatch",
          "cwd must be a worktree linked to the repository pinned by the first delegation"
        );
      }
      if (busyWorktrees.has(worktree.cwd)) {
        throw new BrokerError("cwd_busy", "Another delegated writer is already active in this worktree");
      }
      if (!pinnedCommonDir) pinnedCommonDir = worktree.commonDir;

      const adapter = ADAPTERS[agent];
      const run = launchRun({
        id: randomUUID(),
        agent,
        cwd: worktree.cwd,
        executable: detected.path,
        args: adapter.runArgs({ cwd: worktree.cwd, model }),
        prompt,
        timeoutMs,
        executionMode: adapter.executionMode,
        fullAccess: adapter.fullAccess
      });
      return publicRun(run);
    });
  }

  function findRun(runId) {
    assertString(runId, "run_id", { maxLength: 100 });
    const run = runs.get(runId);
    if (!run) throw new BrokerError("run_not_found", `Unknown run_id: ${runId}`);
    return run;
  }

  function eventsAfter(run, after, limit) {
    return run.events
      .filter((event) => event.seq > after)
      .slice(0, limit)
      .map(({ size: _size, ...event }) => event);
  }

  async function waitForEvents(run, after, waitMs) {
    if (waitMs === 0 || TERMINAL_STATUSES.has(run.status) || run.nextSequence - 1 > after) return;
    await new Promise((resolveWait) => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        run.waiters.delete(done);
        resolveWait();
      };
      run.waiters.add(done);
      if (run.nextSequence - 1 > after || TERMINAL_STATUSES.has(run.status)) {
        done();
        return;
      }
      timer = setTimeout(done, waitMs);
    });
  }

  async function delegateGet(rawArguments) {
    const input = assertObject(rawArguments, "arguments");
    assertAllowedKeys(input, ["run_id", "after", "wait_ms", "max_events"]);
    const run = findRun(input.run_id);
    const after = assertInteger(input.after, "after", { min: 0, max: Number.MAX_SAFE_INTEGER, defaultValue: 0 });
    const waitMs = assertInteger(input.wait_ms, "wait_ms", { min: 0, max: 30_000, defaultValue: 0 });
    const maxRequestedEvents = assertInteger(input.max_events, "max_events", {
      min: 1,
      max: 500,
      defaultValue: 100
    });
    await waitForEvents(run, after, waitMs);
    const firstAvailable = run.events[0]?.seq ?? run.nextSequence;
    const events = eventsAfter(run, after, maxRequestedEvents);
    return {
      ...publicRun(run, events),
      next_after: events.at(-1)?.seq ?? after,
      first_available: firstAvailable,
      truncated: after + 1 < firstAvailable
    };
  }

  async function delegateCancel(rawArguments) {
    const input = assertObject(rawArguments, "arguments");
    assertAllowedKeys(input, ["run_id"]);
    const run = findRun(input.run_id);
    const requested = requestTermination(run, "cancel");
    return { ...publicRun(run), cancellation_requested: requested };
  }

  async function shutdown() {
    for (const run of runs.values()) requestTermination(run, "cancel");
    const deadline = Date.now() + killGraceMs + 500;
    while ([...runs.values()].some((run) => !run.closed) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    for (const run of runs.values()) {
      if (!run.closed) terminateProcessGroup(run.child, "SIGKILL");
    }
  }

  return {
    agentsList,
    delegateStart,
    delegateGet,
    delegateCancel,
    shutdown,
    get pinnedCommonDir() {
      return pinnedCommonDir;
    }
  };
}
