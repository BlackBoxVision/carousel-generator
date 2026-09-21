#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(root, "mcp", "server.mjs");
const home = os.homedir();
const args = new Set(process.argv.slice(2));
const ALL = ["opencode", "claude-code", "claude-desktop", "codex"];
const want = (k) => args.has("--all") || args.has("--" + k) || args.size === 0;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function tryCli(cmd, cliArgs, manual) {
  const r = spawnSync(cmd, cliArgs, { encoding: "utf8" });
  if (r.status === 0) { console.log(`  OK via ${cmd}`); return true; }
  if (r.error && r.error.code === "ENOENT") console.log(`  (${cmd} no instalado) manual: ${manual}`);
  else console.log(`  (${cmd} falló: ${(r.stderr || "").trim().slice(0, 160) || r.status}) manual: ${manual}`);
  return false;
}

if (want("opencode")) {
  console.log("opencode:");
  const p = path.join(home, ".config", "opencode", "opencode.json");
  const cfg = readJson(p, { $schema: "https://opencode.ai/config.json", mcp: {} });
  cfg.mcp = cfg.mcp || {};
  cfg.mcp.carousel = { type: "local", command: ["node", serverPath], enabled: true };
  writeJson(p, cfg);
  console.log(`  OK en ${p} (reiniciá opencode)`);
}

if (want("claude-code")) {
  console.log("Claude Code:");
  tryCli("claude", ["mcp", "add", "carousel", "-s", "user", "--", "node", serverPath],
    `claude mcp add carousel -s user -- node ${serverPath}`);
}

if (want("claude-desktop")) {
  console.log("Claude Desktop:");
  const darwin = path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  const linux = path.join(home, ".config", "Claude", "claude_desktop_config.json");
  const p = process.platform === "darwin" ? darwin : linux;
  const cfg = readJson(p, { mcpServers: {} });
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers.carousel = { command: "node", args: [serverPath] };
  writeJson(p, cfg);
  console.log(`  OK en ${p} (reiniciá Claude Desktop)`);
  console.log("  Alternativa 1-click: abrir dist/carousel-generator.mcpb con Claude Desktop");
}

if (want("codex")) {
  console.log("Codex:");
  const manual = `codex mcp add carousel -- node ${serverPath}`;
  const ok = tryCli("codex", ["mcp", "add", "carousel", "--", "node", serverPath], manual);
  if (!ok) {
    const p = path.join(home, ".codex", "config.toml");
    let toml = "";
    try { toml = fs.readFileSync(p, "utf8"); } catch {}
    const block = `[mcp_servers.carousel]\ncommand = "node"\nargs = [${JSON.stringify(serverPath)}]\n`;
    const re = /\[mcp_servers\.carousel\][^\[]*/;
    toml = re.test(toml) ? toml.replace(re, block) : toml.replace(/\s*$/, "\n\n") + block;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, toml, "utf8");
    console.log(`  OK sección [mcp_servers.carousel] en ${p} (reiniciá Codex)`);
  }
}

console.log("");
console.log("Verificación: `claude mcp list` / `codex mcp list` deben mostrar carousel.");
