# AGENTS.md — Instrucciones para agentes

Guía para agentes (humanos con IA o autónomos) que modifiquen este repo. Seguilas cada vez que toques código para no dejar cosas sin sincronizar.

## Arquitectura MCP (post-refactor)

- `mcp/tools/*.mjs` — cada tool es un módulo default-export con `{ name, description, inputSchema, handler }`. El `inputSchema` (JSON Schema) es la **fuente de verdad**.
- `mcp/lib/*.mjs` — helpers compartidos (paths, kits, narrative, images, persist, render, social, article, brand, preview, handoff, blocks, text, colors, html, const).
- `mcp/registry.mjs` — imports estáticos de las 16 tools → array `tools`, `getTool`, `listToolsForRpc`, `callTool`. Único dispatch.
- `mcp/server.mjs` — bootstrap del SDK `@modelcontextprotocol/sdk` (`Server` de bajo nivel + `setRequestHandler` con JSON Schema, **sin zod**). Log de llamadas JSONL en `CAROUSEL_TOOL_LOG`.
- `manifest.json` → `tools[]` se genera/sincroniza con `node scripts/sync-manifest.mjs` (y `--check` falla si está desincronizado; corre en `npm test`, CI y pre-commit).

## Al agregar o modificar una tool MCP

1. Crear/editar `mcp/tools/{nombre}.mjs` con `name`, `description` e `inputSchema` (JSON Schema). El `handler` recibe `args` y devuelve string (o Promise<string>).
2. Registrar el import + entrada en `mcp/registry.mjs` (`tools` array). No hace falta tocar `callTool` — el dispatch es genérico.
3. Correr `node scripts/sync-manifest.mjs` para regenerar `manifest.json` → `tools[]`.
4. Actualizar la tabla de tools en `README.md` y, si aplica, el conteo ("sixteen tools", etc.).
5. Si la tool responde con protocolos o advertencias, mantener el formato de las existentes (`PHOTO_REVIEW_PROTOCOL`, `NARRATIVE_REVIEW_PROTOCOL`, `styleWarnings`).
6. Si la tool escribe un archivo en la carpeta del carrusel (ej: `source.md`, `social.md`, `previews/`), documentarlo en README → Saved files.
7. Agregar tests: contrato en `tests/tools/registry.test.mjs` (lista EXPECTED), handler en `tests/tools/handlers.test.mjs` si aplica.

## Al modificar el editor (`app/index.html`)

- Correr `npm run smoke` (o `node scripts/smoke.cjs`) y verificar que ningún assert falle.
- El editor es vanilla JS embebido en HTML (sin build step). Mantener las funciones auto-contenidas y el estilo del archivo.
- Si agregás lógica de render o layout, considerar si `fitWordWidth` / `fitCopyBlocks` deben intervenir.
- El modo preview (`?preview=1&slide=N&format=F`) debe seguir funcionando: `render_preview` depende de él.

## Al modificar `mcp/` (tools, lib, registry, server)

- Syntax: el pre-commit ya corre `node --check` en `mcp/**/*.mjs` y `scripts/*.mjs` + `sync-manifest --check`.
- Tests unit/integración: `npm run test:unit` / `npm run test:integration` (o `node --test 'tests/**/*.test.mjs'`).
- Tests de tools end-to-end: `npm run test:tools` (JSON-RPC; mantiene stdin abierto hasta las respuestas).
- From-URL offline: `node scripts/test-fixture-server.mjs` + `node scripts/fixture-server.mjs &` + `npm run test:from-url`.
- Smoke completo: `npm test`.
- Los assets de fotos/logos van a `~/.carousel-generator/carousels/{company}/{slug}/assets/`; **nunca** guardar base64 grande en `carousel.json`.
- Los kits personales viven en `~/.carousel-generator/brand/{empresa}/kit.json` (fuera del repo). En el repo solo se trackea `mcp/kits/example.json`.
- `render_preview` usa Chrome headless: prioriza `chrome-headless-shell` de Playwright, luego Chrome del sistema. Se puede forzar con `CHROME_PATH`.
- El home se puede aislar con `CAROUSEL_GENERATOR_HOME` (lo usan los tests y el agent-e2e).
- `CAROUSEL_TOOL_LOG=/ruta/calls.jsonl` registra cada tools/call `{name, ok, durationMs, ...}` — lo consume `scripts/verify-agent-output.mjs`.

## CI (`.github/workflows/ci.yml`)

- **unit**: syntax + `sync-manifest --check` + `node --test 'tests/**/*.test.mjs'` + editor smoke.
- **tools-e2e**: `scripts/test-tools.mjs` con chrome-headless-shell + `scripts/test-from-url.mjs` contra `scripts/fixture-server.mjs`.
- **agent-e2e**: instala opencode CLI, corre `scripts/run-agent-e2e.mjs --model free` con home/log aislados, luego `scripts/verify-agent-output.mjs` (cobertura 16/16 `ok:true` + artefactos). El exit code del job es el del **verifier**, no el del modelo. Contingencia: si Zen free devuelve 401, agregar secret `OPENCODE_API_KEY` (costo $0).

## Formato de slides y datos

- Formatos: `feed` (1080×1350), `square` (1080×1080), `story` (1080×1920).
- Highlight colors (cascade): `style.background` → `kit.highlightColors[meta.category]` → `kit.colors.primary`.
- Listas: máximo **3 items** por slide (partición automática en generate/save).
- Cifras y datos: `boldifyData` envuelve números clave en `**negrita**` al generar.
- Textos: sin raya larga (—), sin contrastes "no es X, es Y", sin clichés de IA (`lintSlideTexts`).

## Protocolos que el agente debe respetar al entregar

- **Fotos** (`PHOTO REVIEW PROTOCOL`): verificar visualmente cada foto, reemplazar las que no conectan con stock, re-auditar con `review_slide_images`.
- **Narrativa** (`NARRATIVE REVIEW PROTOCOL`): leer todas las slides en orden, confirmar hilo común y arco (portada → desarrollo → cta), corregir con `edit_slide` si `narrativeAudit.flags` marca problemas sólidos.
- **PNGs**: si el usuario pide PNGs ("en 4:5 todos los PNGs"), usar `render_preview` y verificar rutas con visión si hace falta.
- **Publicación**: `social_copy` para captions/hashtags/altText; revisar altText ≤125 y no repetir copy literal.

## Commits

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`. Commitlint + husky lo validan en `commit-msg` (subject en minúsculas).
- No commitear `dist/`, `node_modules/`, ni kits personales (solo `mcp/kits/example.json` está permitido).

## Verificación antes de dar por terminado

- [ ] `node --check` en los archivos tocados (o confiar en el pre-commit)
- [ ] `node scripts/sync-manifest.mjs --check` (o `npm run test:sync`)
- [ ] `npm run test:unit` + `npm run test:integration` (o `npm test` completo)
- [ ] `npm run smoke` (si se tocó `app/index.html`)
- [ ] `npm run test:tools` (si se tocó tools MCP)
- [ ] `manifest.json` sincronizado (regenerar con `npm run sync:manifest` si hace falta)
- [ ] README actualizado (tabla de tools, conteo, nuevos protocolos o reglas, Development)
- [ ] Si se agregó una tool: archivo en `mcp/tools/` + registro en `mcp/registry.mjs` + `sync-manifest` + tests + README
