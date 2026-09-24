# AGENTS.md — Instrucciones para agentes

Guía para agentes (humanos con IA o autónomos) que modifiquen este repo. Seguilas cada vez que toques código para no dejar cosas sin sincronizar.

## Arquitectura MCP (post-refactor)

- `mcp/tools/*.mjs` — cada tool es un módulo default-export con `{ name, description, inputSchema, handler }`. El `inputSchema` (JSON Schema) es la **fuente de verdad**.
- `mcp/lib/*.mjs` — helpers compartidos (paths, kits, narrative, images, persist, render, social, article, brand, preview, handoff, blocks, text, colors, html, const, **validate**).
- `mcp/lib/validate.mjs` — ajv valida `args` en `callTool` **antes** del handler. Estrictez: root + nodos con `properties` → `additionalProperties: false` (runtime only, no se publica en `tools/list`); bare `{type:"object"}` sin properties (`carousel`, `kit`, `meta`) queda libre. Errores en español (`Falta company (requerido).`, `` `format` debe ser uno de: … ``, `Propiedad no permitida: foo.`).
- `mcp/registry.mjs` — imports estáticos de las 22 tools → array `tools`, `getTool`, `listToolsForRpc`, `callTool` (valida con ajv y despacha). Único dispatch.
- `mcp/server.mjs` — bootstrap del SDK `@modelcontextprotocol/sdk` (`Server` de bajo nivel + `setRequestHandler` con JSON Schema, **sin zod**). Log de llamadas JSONL en `CAROUSEL_TOOL_LOG`.
- `manifest.json` → `tools[]` se genera/sincroniza con `node scripts/sync-manifest.mjs` (y `--check` falla si está desincronizado; corre en `npm test`, CI y pre-commit).

## Al agregar o modificar una tool MCP

1. Crear/editar `mcp/tools/{nombre}.mjs` con `name`, `description` e `inputSchema` (JSON Schema). El `handler` recibe `args` y devuelve string (o Promise<string>).
2. Registrar el import + entrada en `mcp/registry.mjs` (`tools` array). No hace falta tocar `callTool` — el dispatch es genérico.
3. Correr `node scripts/sync-manifest.mjs` para regenerar `manifest.json` → `tools[]`.
4. Actualizar la tabla de tools en `README.md` y, si aplica, el conteo ("twenty-two tools", etc.).
5. Si la tool responde con protocolos o advertencias, mantener el formato de las existentes (`PHOTO_REVIEW_PROTOCOL`, `NARRATIVE_REVIEW_PROTOCOL`, `styleWarnings`).
6. Si la tool escribe un archivo en la carpeta del carrusel (ej: `source.md`, `social.md`, `previews/`), documentarlo en README → Saved files.
7. Agregar tests: contrato en `tests/tools/registry.test.mjs` (lista EXPECTED), handler en `tests/tools/handlers.test.mjs` si aplica, y validación en `tests/tools/validate.test.mjs` si el schema es nuevo/cambia.
8. Si la tool manda un campo que el handler lee pero no está en `inputSchema` (ej: `open`), **agregarlo al schema** — con `additionalProperties: false` en runtime lo rechazaría la validación antes del handler.

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
- **Guardas de seguridad** (F2): fetches salientes por `mcp/lib/net.mjs` (`safeFetch`: solo http(s), sin IPs privadas/loopback/metadata, redirects manuales, tope de bytes); paths locales por `mcp/lib/paths.mjs` (`assertPathAllowed`: `$HOME`/`$TMPDIR`/`/tmp`/homeDir); valores CSS/style por `mcp/lib/safe.mjs` (`safeCss`/`safeStyleObject`/`safeKit`: rechazan `<`, `"` y controles). `load_brand_kit` devuelve `logoBytes` en vez de base64 salvo `includeLogo:true`. El bypass en tests/e2e es `CAROUSEL_GENERATOR_ALLOW_LOCAL=1` (lo setean `test-from-url.mjs` y `run-agent-e2e.mjs`). Si agregás una tool que lea un archivo local o escriba en `outputDir`, pasá el path por `assertPathAllowed`; si persistís CSS/style, pasalo por `safeCss`.

## CI (`.github/workflows/ci.yml`)

- **unit**: biome lint (`npx biome check .`) + syntax + `sync-manifest --check` + `bundle:check` + `node --test 'tests/**/*.test.mjs'` + editor smoke.
- **tools-e2e**: `scripts/test-tools.mjs` con chrome-headless-shell + `scripts/test-from-url.mjs` contra `scripts/fixture-server.mjs`.
- **agent-e2e** (canario, `continue-on-error: true`): instala opencode CLI, corre `scripts/run-agent-e2e.mjs` con model `opencode/mimo-v2.6-flash-free` (override: `OPENCODE_MODEL`) y home/log aislados, luego `scripts/verify-agent-output.mjs` (cobertura de tools `ok:true` + artefactos). El exit code del job es el del **verifier**, no el del modelo, y no bloquea PRs: la cobertura obligatoria es unit + tools-e2e. Contingencia: si free devuelve 401, agregar secret `OPENCODE_API_KEY` (costo $0). **No usar** `--model free` (no es un model ID válido).

## Formato de slides y datos

- Formatos: `feed` (1080×1350), `square` (1080×1080), `story` (1080×1920).
- Highlight colors (cascade): `style.background` → `kit.highlightColors[meta.category]` → `kit.colors.primary`.
- Listas: máximo **3 items** por slide (partición automática en generate/save).
- Cifras y datos: `boldifyData` envuelve números clave en `**negrita**` al generar.
- Textos: sin raya larga (—), sin contrastes "no es X, es Y", sin clichés de IA (`lintSlideTexts`).

## Protocolos que el agente debe respetar al entregar

Los protocolos y el `SERVER_INSTRUCTIONS` del MCP están en **inglés** (model adherence). Los errores de runtime/ajv siguen en español.

- **Fotos** (`PHOTO REVIEW PROTOCOL`): verificar visualmente cada foto, reemplazar las que no conectan con stock, re-auditar con `review_slide_images`.
- **Narrativa** (`NARRATIVE REVIEW PROTOCOL`): leer todas las slides en orden, confirmar hilo común y arco (portada → desarrollo → cta), corregir con `edit_slide` (update_text | move | split | set_layout) si `narrativeAudit.flags` marca problemas sólidos.
- **PNGs**: si el usuario pide PNGs ("en 4:5 todos los PNGs"), usar `render_preview` y verificar rutas con visión si hace falta.
- **Publicación**: `social_copy` para captions/hashtags/altText; revisar altText ≤125 y no repetir copy literal.
- **edit_slide acciones**: `update_text | move | duplicate | delete | add | split | set_layout | add_block | delete_block | move_block | set_block | add_item | delete_item | add_pill | update_pill | delete_pill`. El schema es la fuente de verdad; no leer el handler para descubrir args.

## Modo de formatting / lint

- `biome.json` cubre `mcp/`, `scripts/`, `tests/` y los `*.mjs`/`*.json` de la raíz; `app/index.html` queda fuera a propósito (editor vanilla de un solo archivo con su propio smoke test).
- `npm run lint` debe dar 0 errores antes de commitear (`npx biome check --write .` aplica fixes seguros). Reglas ruidosas de estilo (`useTemplate`, `useOptionalChain`, `noAssignInExpressions`) están en `warn` para no pelear con los idiomas del repo.

## Commits

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`. Commitlint + husky lo validan en `commit-msg` (subject en minúsculas).
- No commitear `dist/`, `node_modules/`, ni kits personales (solo `mcp/kits/example.json` está permitido).

## Verificación antes de dar por terminado

- [ ] `npm run lint` (biome; también corre en pre-commit y en `npm test`)
- [ ] `node --check` en los archivos tocados (o confiar en el pre-commit)
- [ ] `node scripts/sync-manifest.mjs --check` (o `npm run test:sync`)
- [ ] `node scripts/bundle-check.mjs` si cambió la versión o el set de tools (o `npm run bundle`)
- [ ] `npm run test:unit` + `npm run test:integration` (o `npm test` completo)
- [ ] `npm run smoke` (si se tocó `app/index.html`)
- [ ] `npm run test:tools` (si se tocó tools MCP)
- [ ] `manifest.json` sincronizado (regenerar con `npm run sync:manifest` si hace falta)
- [ ] README actualizado (tabla de tools, conteo, nuevos protocolos o reglas, Development)
- [ ] Si se agregó una tool: archivo en `mcp/tools/` + registro en `mcp/registry.mjs` + `sync-manifest` + tests + README
- [ ] Si se agregó/cambió un campo en un `inputSchema`: los tests de `validate.test.mjs` siguen verdes (required/type/enum/strict)
