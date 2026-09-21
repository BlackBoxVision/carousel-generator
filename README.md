# carousel-generator

Instagram carousel generator with brand kits, golden-ratio calibrated slides, a visual editor, and an MCP server so AI agents can generate carousels with a single tool call.

## What it does

- **`generate_carousel`** (MCP tool) renders a ready-to-edit HTML file with your content pre-loaded, opens it in the browser, and embeds **all** your saved brand kits so you can switch kits live.
- **Visual editor** (`app/index.html`): slide navigator with drag reorder, canvas with click-to-edit text directly on slides, inspector panel, per-slide backgrounds (kit gradient / custom CSS / photo), PNG export and PDF export.
- **Formats**: `feed` 4:5 (1080×1350) · `square` 1:1 (1080×1080, IG/LinkedIn) · `story` 9:16 (1080×1920, stories/reels/TikTok) — switchable live in the editor or via the `format` MCP param. Stories include IG/TikTok UI safe-zone guides.
- **Golden-ratio (φ) calibration**: type scale 11 → 14 → 22.6 → 36.6 → 59.2 (hero on covers), φ spacing series (8/13/21/34), copy anchored in the bottom 38.2%, overlay transition at 61.8%, toggleable φ guides + safe area.
- **Multi-kit**: one folder per brand/company, pick between them from the editor header or via `kitName`.
- **Logo images**: brand kits accept a logo image (transparent PNG recommended) with a letter fallback.

## Install (one command, all clients)

```bash
node install.mjs            # all clients (default)
node install.mjs --codex    # or pick: --opencode --claude-code --claude-desktop --codex
```

| Client | Method |
|---|---|
| opencode | `install.mjs` patches `opencode.json` (restart opencode after) |
| Claude Code | `install.mjs` runs `claude mcp add` (or run it manually) |
| Claude Desktop | `install.mjs` edits `claude_desktop_config.json` — or 1-click install with `dist/carousel-generator.mcpb` |
| Codex (CLI / IDE / desktop) | `install.mjs` runs `codex mcp add` (falls back to `[mcp_servers.carousel]` in `config.toml`) |

The server is plain JSON-RPC over stdio with zero dependencies — nothing in it is tied to any client. Restart the client after registering (local MCP servers spawn at startup and are never respawned mid-session).

## MCP Bundle (.mcpb)

```bash
npm run bundle   # produces dist/carousel-generator.mcpb
```

One-click install in Claude Desktop and any MCPB-compatible client. Ships the server, the editor, and the example kit.

## MCP tools

| Tool | Purpose |
|---|---|
| `generate_carousel` | Renders the HTML (opens it in the browser), pre-loaded with slides + active kit + format, all kits embedded for live switching |
| `save_brand_kit` | Saves/merges a kit into `~/.carousel-generator/brand/{company}/kit.json` (embeds `logo.imagePath` as base64) |
| `list_brand_kits` | Lists personal company folders first, then repo examples |
| `load_brand_kit` | Returns a kit's full JSON |

Slide templates: `cover` (hero title), `fact`, `map` (location pills, light background), `list`, `cta` (brand box). Paragraphs support `**bold**`. Photos via `background: "file:/path/to/photo.jpg"` (embedded as base64).

## Brand kits

One folder per company — kit definition and visual assets live together:

```
~/.carousel-generator/
└── brand/
    └── {company}/
        ├── kit.json
        └── logo.png
```

Kits resolve in this order: `~/.carousel-generator/brand/*/kit.json` → `mcp/kits/` (repo examples) → built-in Default. (The pre-v2.1 `~/.carousel-generator/kits/*.json` layout is still read as a fallback.)

Kit schema:

```jsonc
{
  "name": "My Brand",
  "colors": { "primary": "#f45b16", "secondary": "#071522", "tertiary": "#ffffff", "slideBg": "#14283a" },
  "fonts": { "heading": "'JetBrains Mono', monospace", "body": "'Archivo Narrow', sans-serif", "googleUrl": "https://..." },
  "logo": {
    "letter": "m", "text": "My Brand",
    "imagePath": "logo.png",   // relative to the company folder (or "file:" + absolute) → embedded as base64
    "imgH": 48                 // logo height in px on the slide
  },
  "gradients": [{ "name": "navy", "css": "linear-gradient(...)", "light": false }]
}
```

## Development

- No build step for the app/server. Edit `app/index.html` and `mcp/server.mjs` directly.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint + husky (`feat|fix|docs|chore(editor|mcp|bundle|docs|assets|install): …`).
- Smoke tests: `node /tmp/smoke.cjs` (app logic via `vm`), stdio test: `node mcp/server.mjs < request.jsonl`.
- After changing the server, restart the MCP client.
