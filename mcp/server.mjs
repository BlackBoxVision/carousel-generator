import { appendFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_INFO, SERVER_INSTRUCTIONS } from "./lib/const.mjs";
import { callTool, listToolsForRpc } from "./registry.mjs";

function toolLog(entry) {
  const file = process.env.CAROUSEL_TOOL_LOG;
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (e) {
    process.stderr.write(`[carousel-mcp] tool log write failed: ${e.message}\n`);
  }
}

const server = new Server(SERVER_INFO, {
  capabilities: { tools: {} },
  instructions: SERVER_INSTRUCTIONS,
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listToolsForRpc(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};
  const started = Date.now();
  try {
    const text = await callTool(name, args);
    toolLog({ name, ok: true, durationMs: Date.now() - started, at: new Date().toISOString() });
    return { content: [{ type: "text", text }] };
  } catch (e) {
    const message = "ERROR: " + (e && e.message ? e.message : String(e));
    toolLog({ name, ok: false, durationMs: Date.now() - started, at: new Date().toISOString(), error: message.slice(0, 500) });
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
