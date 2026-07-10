#!/usr/bin/env node

import { once } from "node:events";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { BrokerError, createBroker } from "./broker.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "agents_list",
    description:
      "List installed allowlisted local coding agents and their fixed unattended execution modes. This checks executable availability only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "delegate_start",
    description:
      "Start an asynchronous coding-agent run. Codex and Claude bypass sandboxing; Cursor uses yolo with its workspace sandbox enabled. Every request must carry confirmation derived from the user's current consent.",
    inputSchema: {
      type: "object",
      required: ["agent_id", "cwd", "prompt", "confirmed_unattended"],
      properties: {
        agent_id: {
          type: "string",
          enum: ["codex", "claude", "cursor"],
          description: "Allowlisted agent adapter."
        },
        cwd: {
          type: "string",
          maxLength: 16384,
          description:
            "Absolute Git worktree root. After the first run, only linked worktrees from the same repository are allowed."
        },
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: 1048576,
          description:
            "Prompt sent through stdin; the broker does not place it in argv or add it to broker events."
        },
        model: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "Optional agent-specific model name."
        },
        timeout_ms: {
          type: "integer",
          minimum: 1,
          maximum: 14400000,
          description: "Optional execution deadline in milliseconds."
        },
        confirmed_unattended: {
          type: "boolean",
          description:
            "Must be true to acknowledge unattended execution and the selected adapter's maximum permission mode; standing consent may supply this without prompting again."
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  {
    name: "delegate_get",
    description:
      "Read run status and incremental stdout/stderr events, optionally waiting for a change.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string", minLength: 1, maxLength: 100 },
        after: {
          type: "integer",
          minimum: 0,
          description: "Return events whose sequence number is greater than this value."
        },
        wait_ms: {
          type: "integer",
          minimum: 0,
          maximum: 30000,
          description: "Long-poll duration when no newer event is available."
        },
        max_events: {
          type: "integer",
          minimum: 1,
          maximum: 500
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "delegate_cancel",
    description:
      "Idempotently cancel a delegated run and terminate its complete process group.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string", minLength: 1, maxLength: 100 }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  }
]);

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function toolError(error) {
  const value = {
    error: error instanceof BrokerError ? error.code : "internal_error",
    message: error instanceof BrokerError ? error.message : "The tool call failed"
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value
  };
}

export function createRequestHandler(broker = createBroker()) {
  return async function handleRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      return jsonRpcError(null, -32600, "Invalid Request");
    }
    const id = request.id;
    const notification = id === undefined;
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return notification ? undefined : jsonRpcError(id, -32600, "Invalid Request");
    }

    if (request.method === "notifications/initialized") return undefined;
    if (request.method === "initialize") {
      if (notification) return undefined;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "dev-agents", version: "0.2.1" },
          instructions:
            "Delegations are asynchronous and unattended. Codex and Claude disable sandboxing; Cursor keeps its workspace sandbox enabled. Set confirmed_unattended only from current user consent, including recorded standing consent."
        }
      };
    }
    if (request.method === "ping") {
      if (notification) return undefined;
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (request.method === "tools/list") {
      if (notification) return undefined;
      return { jsonrpc: "2.0", id, result: { tools: TOOL_DEFINITIONS } };
    }
    if (request.method === "tools/call") {
      if (notification) return undefined;
      const name = request.params?.name;
      const args = request.params?.arguments ?? {};
      try {
        let value;
        if (name === "agents_list") value = await broker.agentsList(args);
        else if (name === "delegate_start") value = await broker.delegateStart(args);
        else if (name === "delegate_get") value = await broker.delegateGet(args);
        else if (name === "delegate_cancel") value = await broker.delegateCancel(args);
        else return jsonRpcError(id, -32602, `Unknown tool: ${String(name)}`);
        return { jsonrpc: "2.0", id, result: toolResult(value) };
      } catch (error) {
        return { jsonrpc: "2.0", id, result: toolError(error) };
      }
    }
    return notification ? undefined : jsonRpcError(id, -32601, "Method not found");
  };
}

export async function serveStdio({ input = process.stdin, output = process.stdout, broker = createBroker() } = {}) {
  const handleRequest = createRequestHandler(broker);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  const pending = new Set();
  let writeQueue = Promise.resolve();

  const writeResponse = (response) => {
    if (response === undefined) return Promise.resolve();
    writeQueue = writeQueue.then(async () => {
      if (!output.write(`${JSON.stringify(response)}\n`)) {
        await once(output, "drain");
      }
    });
    return writeQueue;
  };

  const dispatch = (request) => {
    const operation = Promise.resolve()
      .then(() => handleRequest(request))
      .then(writeResponse)
      .catch(() => writeResponse(jsonRpcError(request?.id, -32603, "Internal error")));
    pending.add(operation);
    operation.finally(() => pending.delete(operation));
  };

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        writeResponse(jsonRpcError(null, -32700, "Parse error"));
        continue;
      }
      dispatch(request);
    }
    await Promise.all(pending);
    await writeQueue;
  } finally {
    await broker.shutdown();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  const broker = createBroker();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await broker.shutdown();
    process.stdin.destroy();
    process.exitCode = 0;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await serveStdio({ broker });
}
