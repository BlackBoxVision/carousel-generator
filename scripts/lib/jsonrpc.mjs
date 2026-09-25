import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
export const SERVER = path.join(ROOT, "mcp", "server.mjs");

/**
 * One-shot JSON-RPC exchange over stdio: spawns the MCP server, writes `msgs`,
 * and resolves a Map<id, response> once every `waitIds` arrived.
 * Keeps stdin open until then (the server exits on stdin close).
 */
export function rpc(msgs, waitIds, opts = {}) {
  const { env, timeoutMs = 60000 } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    let buf = "";
    let err = "";
    const results = new Map();
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(
        new Error("timeout waiting for " + waitIds.join(",") + "\n" + err.slice(0, 500) + "\n" + buf.slice(0, 500)),
      );
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id != null) results.set(obj.id, obj);
        } catch {}
      }
      if (waitIds.every((id) => results.has(id))) {
        clearTimeout(timer);
        try {
          child.stdin.end();
        } catch {}
        setTimeout(() => {
          try {
            child.kill();
          } catch {}
        }, 50);
        resolve(results);
      }
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", () => {
      if (waitIds.every((id) => results.has(id))) {
        clearTimeout(timer);
        resolve(results);
      }
    });
    for (const m of msgs) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

export function toolCall(id, name, args) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

export function initMsg(id = 1, clientName = "driver") {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: clientName, version: "1" } },
  };
}

export function contentText(res) {
  const r = res && res.result;
  if (!r) throw new Error("no result: " + JSON.stringify(res).slice(0, 300));
  if (r.isError)
    throw new Error("tool error: " + ((r.content && r.content[0] && r.content[0].text) || "").slice(0, 400));
  return (r.content || []).map((c) => c.text || "").join("\n");
}

/** Every tool result must be parseable JSON (F5 envelope invariant). */
export function textJson(res) {
  const text = contentText(res);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`result is not JSON (${e.message}): ${text.slice(0, 240)}`);
  }
}
