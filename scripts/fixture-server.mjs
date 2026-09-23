#!/usr/bin/env node
/**
 * Local fixture HTTP server for brand_kit_from_url / carousel_from_url tests.
 * Serves a deterministic homepage + article so CI stays offline-safe.
 *
 * Usage: node scripts/fixture-server.mjs [port]
 * Prints "READY <port>" on stdout once listening. SIGTERM/SIGINT shuts down.
 */
import http from "node:http";

const PORT = parseInt(process.argv[2] || process.env.FIXTURE_PORT || "8765", 10);

const HOMEPAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Café Norte — Tiendas de café en Buenos Aires</title>
  <meta property="og:site_name" content="Café Norte">
  <meta property="og:description" content="Café de especialidad tostado en Buenos Aires.">
  <meta name="theme-color" content="#c45c26">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap">
  <link rel="icon" href="/static/logo.png">
</head>
<body>
  <header><img src="/static/logo.png" alt="Café Norte logo" width="120"></header>
  <main>
    <h1>Café Norte</h1>
    <p>Tostamos café de especialidad en Buenos Aires desde 2015. Envíos a todo el país.</p>
    <a class="btn" href="/tienda">Comprar</a>
  </main>
</body>
</html>`;

const ARTICLE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>El café de especialidad creció 42% en la región</title>
  <meta property="og:site_name" content="Café Norte">
  <meta property="og:description" content="La demanda de tostado artesanal se duplicó en tres años.">
  <meta property="article:section" content="Mercado">
</head>
<body>
  <article>
    <h1>El café de especialidad creció 42% en la región</h1>
    <p class="dek">La demanda de tostado artesanal se duplicó en tres años según la asociación de productores.</p>
    <p>El consumo de café de especialidad creció 42% en los últimos tres años, impulsado por cafés de origen y tostado local.</p>
    <p>Las tostaderías independientes sumaron 120 mil clientes nuevos y exportaron US$ 3 millones.</p>
    <ul>
      <li>Subió 42% el consumo regional</li>
      <li>US$ 3 millones en exportaciones</li>
      <li>120 mil clientes nuevos en tostaderías</li>
    </ul>
    <img src="/static/beans.jpg" alt="Granos de café">
    <img src="/static/logo.png" alt="logo">
  </article>
</body>
</html>`;

// 1x1 transparent PNG as logo stand-in (real bytes, valid PNG header)
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal JPEG (1x1)
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z",
  "base64"
);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  const send = (type, body, status = 200) => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };

  if (p === "/" || p === "/index.html") return send("text/html; charset=utf-8", HOMEPAGE);
  if (p === "/nota" || p === "/nota/cafe-especialidad" || p.startsWith("/nota/")) {
    return send("text/html; charset=utf-8", ARTICLE);
  }
  if (p === "/static/logo.png") return send("image/png", LOGO_PNG);
  if (p === "/static/beans.jpg") return send("image/jpeg", JPG);
  if (p === "/health") return send("text/plain", "ok");
  return send("text/plain", "not found", 404);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`READY ${PORT}\n`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
});
