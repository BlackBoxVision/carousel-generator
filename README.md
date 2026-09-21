# carousel-generator

Instagram 4:5 (1080×1350) carousel generator with brand kits, a golden-ratio calibrated slide system, a visual editor, and an MCP server so AI agents can generate carousels with a single tool call.

## What it does

- **`generate_carousel`** (MCP tool) renders a ready-to-edit HTML file with your content pre-loaded, opens it in the browser, and embeds **all** your saved brand kits so you can switch kits live.
- **Visual editor** (`app/index.html`): 3-column layout (slide navigator | canvas | inspector), click-to-edit text directly on slides, drag pills, per-slide backgrounds (kit gradient / custom CSS / photo), PNG export per slide at 1080×1350.
- **Golden-ratio (φ) calibration**: type scale 11 → 14 → 22.6 → 36.6 → 59.2 (hero on covers), φ spacing series (8/13/21/34), copy anchored in the bottom 38.2%, overlay transition at 61.8%, and toggleable φ guides + safe area in the editor.
- **Multi-kit**: keep one kit per brand/company and pick between them from the editor header or via `kitName` in the MCP.
- **Logo images**: brand kits accept a logo image (transparent PNG recommended) with a letter fallback.

## Repo structure

```
carousel-generator/
├── app/index.html        # visual editor (the HTML generate_carousel injects data into)
├── mcp/server.mjs        # MCP server (JSON-RPC over stdio, zero dependencies)
├── mcp/kits/example.json # generic example kit (the only tracked kit)
├── manifest.json         # MCP Bundle (.mcpb) manifest
├── install.mjs           # registers the MCP in opencode
└── README.md
```

## Quick start

### As an MCP server (AI agents)

Register it once. Easiest: `node install.mjs` (patches `~/.config/opencode/opencode.json`). Or manually:

```json
{
  "mcp": {
    "carousel": {
      "type": "local",
      "command": ["node", "/path/to/carousel-generator/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

Restart the client afterwards — local MCP servers are spawned at startup.

### As an MCP Bundle (.mcpb)

```bash
npm run bundle   # produces dist/carousel-generator.mcpb
```

Install the `.mcpb` file with one click in any bundle-compatible client (Claude desktop, Claude Code). It ships the server, the editor, and the example kit — zero dependencies.

### Manual use (no agent)

Generate once via the MCP (or open `app/index.html` directly to start from scratch), edit in the browser, export PNGs with the ⬇ buttons.

## MCP tools

| Tool | Purpose |
|---|---|
| `generate_carousel` | Renders the HTML (opens it in the browser), pre-loaded with slides + active kit, all kits embedded for live switching |
| `save_brand_kit` | Saves/merges a kit into `~/.carousel-generator/kits/` (embeds `logo.imagePath` as base64) |
| `list_brand_kits` | Lists personal kits first, then repo examples |
| `load_brand_kit` | Returns a kit's full JSON |

Slide templates: `cover` (hero title), `fact`, `map` (location pills, light background), `list`, `cta` (brand box). Paragraphs support `**bold**`. Photos via `background: "file:/path/to/photo.jpg"` (embedded as base64).

## Brand kits

Kits resolve in this order: `~/.carousel-generator/kits/` → `mcp/kits/` (repo, examples) → built-in Default. Personal kits win on name collisions.

Kit schema:

```jsonc
{
  "name": "My Brand",
  "colors": { "primary": "#f45b16", "secondary": "#071522", "tertiary": "#ffffff", "slideBg": "#14283a" },
  "fonts": { "heading": "'JetBrains Mono', monospace", "body": "'Archivo Narrow', sans-serif", "googleUrl": "https://..." },
  "logo": {
    "letter": "m", "text": "My Brand",
    "imagePath": "my-brand/logo.png",   // relative to ~/.carousel-generator/brand/ (or "file:" + absolute) → embedded as base64
    "imgH": 48                          // logo height in px on the slide
  },
  "gradients": [{ "name": "navy", "css": "linear-gradient(...)", "light": false }]
}
```

Per-machine assets:

```
~/.carousel-generator/
├── brand/{company}/logo.png   # logo sources (any company folder)
└── kits/{company}.json        # brand kits
```

Each company gets its own folder + kit — they all appear in the editor's kit picker.

## Development

- No build step, no dependencies. Edit `app/index.html` and `mcp/server.mjs` directly.
- Smoke tests: `node /tmp/smoke.cjs` (app logic via `vm`), stdio test: `node mcp/server.mjs < request.jsonl`.
- After changing the server, restart the MCP client — killed/edited servers are never respawned mid-session.
