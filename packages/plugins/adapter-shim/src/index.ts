import * as readline from "readline";
import type { Agent, Runtime, RuntimeHandle } from "@made-by-moonlight/athene-core";

// The shim is invoked as: node index.js <plugin-package-name> <slot>
const [, , packageName, slot] = process.argv;

interface JsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcError {
  code: number;
  message: string;
}

async function main(): Promise<void> {
  if (!packageName || !slot) {
    process.stderr.write("Usage: node index.js <plugin-package-name> <slot>\n");
    process.exit(1);
  }

  const mod = await import(packageName) as { default: { create: () => unknown } };
  const plugin = mod.default.create();

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line: string) => {
    void handleLine(line, plugin);
  });
}

async function handleLine(line: string, plugin: unknown): Promise<void> {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }

  let result: unknown = null;
  let error: JsonRpcError | null = null;

  try {
    switch (req.method) {
      case "isProcessRunning": {
        if (slot !== "agent") {
          error = { code: -32601, message: `Method not found: ${req.method}` };
          break;
        }
        const { sessionId, runtimeHandle } = req.params as {
          sessionId: string;
          runtimeHandle: RuntimeHandle;
        };
        result = await (plugin as Agent).isProcessRunning({
          id: sessionId,
          runtimeName: (runtimeHandle as RuntimeHandle).runtimeName ?? "",
          data: (runtimeHandle as RuntimeHandle).data ?? {},
        });
        break;
      }
      case "getActivityState": {
        if (slot !== "agent") {
          error = { code: -32601, message: `Method not found: ${req.method}` };
          break;
        }
        const { session, readyThresholdMs } = req.params as {
          session: Parameters<Agent["getActivityState"]>[0];
          readyThresholdMs?: number;
        };
        result = await (plugin as Agent).getActivityState(session, readyThresholdMs);
        break;
      }
      case "detectActivity": {
        if (slot !== "agent") {
          error = { code: -32601, message: `Method not found: ${req.method}` };
          break;
        }
        const { terminalOutput } = req.params as { terminalOutput: string };
        result = (plugin as Agent).detectActivity(terminalOutput);
        break;
      }
      case "send": {
        if (slot !== "runtime") {
          error = { code: -32601, message: `Method not found: ${req.method}` };
          break;
        }
        const { handle, message } = req.params as {
          handle: RuntimeHandle;
          message: string;
        };
        await (plugin as Runtime).sendMessage(handle, message);
        result = null;
        break;
      }
      case "kill": {
        if (slot !== "runtime") {
          error = { code: -32601, message: `Method not found: ${req.method}` };
          break;
        }
        const { handle } = req.params as { handle: RuntimeHandle };
        await (plugin as Runtime).destroy(handle);
        result = null;
        break;
      }
      default:
        error = { code: -32601, message: `Method not found: ${req.method}` };
    }
  } catch (err) {
    error = {
      code: -32000,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const response = error
    ? { jsonrpc: "2.0", id: req.id, error }
    : { jsonrpc: "2.0", id: req.id, result };

  process.stdout.write(JSON.stringify(response) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
