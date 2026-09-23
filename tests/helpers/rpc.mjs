import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
export const SERVER = path.join(ROOT, "mcp", "server.mjs");

/**
 * Run JSON-RPC messages against a fresh MCP server process.
 * Keeps stdin open until all waitIds respond (server exits on stdin close).
 */
export function rpc(msgs, waitIds, { timeoutMs = 60000, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let buf = "";
    let err = "";
    const results = new Map();
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error("timeout waiting for " + waitIds.join(",") + "\n" + err.slice(0, 500) + "\n" + buf.slice(0, 500)));
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
        try { child.stdin.end(); } catch {}
        setTimeout(() => { try { child.kill(); } catch {} }, 50);
        resolve(results);
      }
    });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", () => {
      if (waitIds.every((id) => results.has(id))) {
        clearTimeout(timer);
        resolve(results);
      }
    });
    for (const m of msgs) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

export function contentText(res) {
  const r = res && res.result;
  if (!r) throw new Error("no result: " + JSON.stringify(res).slice(0, 300));
  if (r.isError) throw new Error("tool error: " + ((r.content && r.content[0] && r.content[0].text) || "").slice(0, 400));
  return (r.content || []).map((c) => c.text || "").join("\n");
}

export const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } } };

export function call(id, name, args) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args || {} } };
}
