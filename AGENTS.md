# AGENTS.md — Instrucciones para agentes

Guía para agentes (humanos con IA o autonomos) que modifiquen este repo. Seguilas cada vez que toques código para no dejar cosas sin sincronizar.

## Al agregar o modificar una tool MCP

1. Agregar/editar el objeto en el array `tools[]` de `mcp/server.mjs` con `name`, `description` y `inputSchema` (JSON Schema).
2. Agregar el `case` correspondiente en `callTool()` (`mcp/server.mjs`).
3. Actualizar `manifest.json` → `tools[]` (el bundle MCPB lo lee de ahí).
4. Actualizar la tabla de tools en `README.md` y, si aplica, el conteo ("thirteen tools", etc.).
5. Si la tool responde con protocolos o advertencias, mantener el formato de las existentes (`PHOTO_REVIEW_PROTOCOL`, `NARRATIVE_REVIEW_PROTOCOL`, `styleWarnings`).

## Al modificar el editor (`app/index.html`)

- Correr `node /tmp/smoke.cjs` y verificar que ningún assert falle.
- El editor es vanilla JS embebido en HTML (sin build step). Mantener las funciones auto-contenidas y el estilo del archivo.
- Si agregás lógica de render o layout, considerar si `fitWordWidth` / `fitCopyBlocks` deben intervenir.

## Al modificar `mcp/server.mjs`

- Correr `node --check mcp/server.mjs` (también corre en pre-commit).
- Smoke del server: `node mcp/server.mjs < request.jsonl`.
- Los assets de fotos/logos van a `~/.carousel-generator/carousels/{company}/{slug}/assets/`; **nunca** guardar base64 grande en `carousel.json`.
- Los kits personales viven en `~/.carousel-generator/brand/{empresa}/kit.json` (fuera del repo). En el repo solo se trackea `mcp/kits/example.json`.

## Formato de slides y datos

- Formatos: `feed` (1080×1350), `square` (1080×1080), `story` (1080×1920).
- Highlight colors (cascade): `style.background` → `kit.highlightColors[meta.category]` → `kit.colors.primary`.
- Listas: máximo **3 items** por slide (partición automática en generate/save).
- Cifras y datos: `boldifyData` envuelve números clave en `**negrita**` al generar.
- Textos: sin raya larga (—), sin contrastes "no es X, es Y", sin clichés de IA (`lintSlideTexts`).

## Protocolos que el agente debe respetar al entregar

- **Fotos** (`PHOTO REVIEW PROTOCOL`): verificar visualmente cada foto, reemplazar las que no conectan con stock, re-auditar con `review_slide_images`.
- **Narrativa** (`NARRATIVE REVIEW PROTOCOL`): leer todas las slides en orden, confirmar hilo común y arco (portada → desarrollo → cta), corregir con `edit_slide` si `narrativeAudit.flags` marca problemas sólidos.

## Commits

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Commitlint + husky lo validan en `commit-msg`.
- No commitear `dist/`, `node_modules/`, ni kits personales (solo `mcp/kits/example.json` está permitido).

## Verificación antes de dar por terminado

- [ ] `node --check mcp/server.mjs`
- [ ] `node --check install.mjs`
- [ ] `node /tmp/smoke.cjs` (si se tocó `app/index.html`)
- [ ] `manifest.json` sincronizado con el array `tools[]`
- [ ] README actualizado (tabla de tools, conteo, nuevos protocolos o reglas)
- [ ] Si se agregó una tool: caso en `callTool()` + schema en `tools[]` + manifest + README
