/**
 * Guardas de entrada para valores que terminan en contextos sensibles
 * (atributos style, CSS inline, <style>) - evitan XSS por inyeccion.
 * Se rechazan < > " y controles: los sinks del editor usan atributos entre
 * comillas dobles (y escAttr como defensa extra); ' simple es valido para
 * font-family ('Inter') y url('...').
 * Los errores siguen en espanol (runtime).
 */

const INJECTION = /[<>"]/;

function hasControl(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

function fail(field, value) {
  const v = String(value)
    .slice(0, 80)
    .split("")
    .map((ch) => {
      const c = ch.codePointAt(0);
      return c < 32 || c === 127 ? "?" : ch;
    })
    .join("");
  throw new Error(`\`${field}\` contiene caracteres no permitidos (< > " o de control): "${v}".`);
}

/** Valida y devuelve un string libre de inyectores HTML/CSS. Lanza si hay inyeccion. */
export function safeCss(value, field = "css") {
  const s = String(value ?? "").trim();
  if (!s) return s;
  if (INJECTION.test(s) || hasControl(s)) fail(field, s);
  if (s.length > 2000) throw new Error(`\`${field}\` demasiado largo (${s.length} > 2000 chars).`);
  return s;
}

/** Igual que safeCss pero opcional (undefined/null pasan sin validar). */
export function safeCssOpt(value, field) {
  if (value === undefined || value === null) return value;
  return safeCss(value, field);
}

/** Sanea recursivamente los valores string de un objeto de estilo (set_block / kit). */
export function safeStyleObject(style, field = "style") {
  if (!style || typeof style !== "object") return style;
  const out = {};
  for (const [k, v] of Object.entries(style)) {
    out[k] = typeof v === "string" ? safeCss(v, `${field}.${k}`) : v;
  }
  return out;
}

/** Sanea un kit: gradients[].css, photoOverlay.css, logo.background, colors, fonts. */
export function safeKit(kit) {
  if (!kit || typeof kit !== "object") return kit;
  const out = { ...kit };
  if (Array.isArray(out.gradients)) {
    out.gradients = out.gradients.map((g) =>
      g && typeof g === "object"
        ? { ...g, css: safeCssOpt(g.css, "gradients[].css"), name: safeCssOpt(g.name, "gradients[].name") }
        : g,
    );
  }
  if (out.photoOverlay && typeof out.photoOverlay === "object") {
    out.photoOverlay = { ...out.photoOverlay, css: safeCssOpt(out.photoOverlay.css, "photoOverlay.css") };
  }
  if (out.logo && typeof out.logo === "object") {
    const l = { ...out.logo };
    out.logo = {
      ...l,
      background: safeCssOpt(l.background, "logo.background"),
      img: safeCssOpt(l.img, "logo.img"),
      imgH: typeof l.imgH === "string" ? safeCss(l.imgH, "logo.imgH") : l.imgH,
      letter: safeCssOpt(l.letter, "logo.letter"),
      text: safeCssOpt(l.text, "logo.text"),
    };
  }
  if (out.colors && typeof out.colors === "object") {
    const c = {};
    for (const [k, v] of Object.entries(out.colors)) c[k] = typeof v === "string" ? safeCss(v, `colors.${k}`) : v;
    out.colors = c;
  }
  if (out.fonts && typeof out.fonts === "object") {
    const f = {};
    for (const [k, v] of Object.entries(out.fonts)) f[k] = typeof v === "string" ? safeCss(v, `fonts.${k}`) : v;
    if (f.googleUrl && !/^https:\/\//i.test(f.googleUrl)) {
      throw new Error(`\`fonts.googleUrl\` debe ser https:// (recibiste: ${String(f.googleUrl).slice(0, 80)}).`);
    }
    out.fonts = f;
  }
  return out;
}
