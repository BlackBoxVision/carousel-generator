export function hexNorm(h) {
  h = String(h).toLowerCase().trim();
  if (!h.startsWith("#")) h = "#" + h;
  if (/^#[0-9a-f]{3}$/.test(h)) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}
export function hexRgb(h) {
  const n = parseInt(hexNorm(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbHex(r, g, b) {
  const c = (x) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
export function hexMix(h1, h2, t) {
  const a = hexRgb(h1),
    b = hexRgb(h2);
  return rgbHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
export function hexLum(h) {
  const [r, g, b] = hexRgb(h).map((x) => x / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function isGray(h) {
  const [r, g, b] = hexRgb(h);
  return Math.max(r, g, b) - Math.min(r, g, b) < 14;
}
