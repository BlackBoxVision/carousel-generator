#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(root, "mcp", "server.mjs");
const configPath = path.join(os.homedir(), ".config", "opencode", "opencode.json");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return { $schema: "https://opencode.ai/config.json", mcp: {} };
  }
}

const cfg = readConfig();
cfg.mcp = cfg.mcp || {};
cfg.mcp.carousel = {
  type: "local",
  command: ["node", serverPath],
  enabled: true,
};
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");

console.log(`MCP "carousel" registrado en ${configPath}`);
console.log(`Servidor: ${serverPath}`);
console.log("Reiniciá opencode para que quede disponible.");
console.log("");
console.log("Otros clientes:");
console.log(`  Claude Code: claude mcp add carousel -s user -- node ${serverPath}`);
console.log("  Claude Desktop / Cursor: agregá el comando anterior como servidor MCP local,");
console.log("  o instalá dist/carousel-generator.mcpb con un click (npm run bundle para generarlo).");
