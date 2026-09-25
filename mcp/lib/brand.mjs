import { hexLum, hexMix, hexNorm, isGray } from "./colors.mjs";
import { DEFAULT_KIT, IMG_EXTS } from "./const.mjs";
import { linksHref, metaContent } from "./html.mjs";
import { safeFetch } from "./net.mjs";
import { clone } from "./text.mjs";

export async function downloadLogoDataURL(logoUrl) {
  const res = await safeFetch(logoUrl, { timeoutMs: 12000, maxBytes: 500000 });
  const ct = res.contentType;
  const ext = String(logoUrl).split("?")[0].split(".").pop().toLowerCase();
  const mime = ct && ct.startsWith("image/") ? ct : IMG_EXTS["." + ext];
  if (!mime) throw new Error(`MIME no-imagen (${ct || "?"})`);
  const buf = res.buffer;
  if (!buf.length || buf.length > 500000) throw new Error("logo vacío o mayor a 500KB");
  return { dataURL: `data:${mime};base64,` + buf.toString("base64"), source: logoUrl };
}
export function inferKitFromHTML(html, pageUrl) {
  const conf = {};
  const title = (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1];
  const siteName = metaContent(html, "property", "og:site_name") || metaContent(html, "name", "application-name");
  const theme = metaContent(html, "name", "theme-color") || metaContent(html, "name", "msapplication-TileColor");
  const counts = {};
  const re = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let m;
  while ((m = re.exec(html))) {
    const h = hexNorm(m[0]);
    counts[h] = (counts[h] || 0) + 1;
  }
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  const saturated = ranked.filter(([h]) => !isGray(h) && h !== "#ffffff" && h !== "#000000");
  const pick = (list, fb) => (list.length ? list[0][0] : fb);
  void pick;
  let primary, primarySrc;
  if (theme && /^#[0-9a-f]{3,6}$/i.test(theme)) {
    primary = hexNorm(theme);
    primarySrc = "meta theme-color";
    conf.primary = "alta";
  } else if (saturated.length) {
    primary = saturated[0][0];
    primarySrc = `color frecuente (×${saturated[0][1]})`;
    conf.primary = "media";
  } else {
    primary = DEFAULT_KIT.colors.primary;
    primarySrc = "fallback Default";
    conf.primary = "baja";
  }
  const darks = ranked.filter(([h]) => hexLum(h) < 0.12 && h !== primary);
  const secondary = darks.length ? darks[0][0] : "#0f172a";
  conf.secondary = darks.length ? "media" : "baja";
  const lights = ranked.filter(([h]) => hexLum(h) > 0.75 && !isGray(h));
  const lightHit = lights.length ? lights[0][0] : null;
  const gFonts = linksHref(html, /stylesheet/i).filter((h) => h.includes("fonts.googleapis.com"));
  const googleUrl = gFonts.length
    ? gFonts[0].startsWith("http")
      ? gFonts[0]
      : new URL(gFonts[0], pageUrl).href
    : null;
  conf.fonts = googleUrl ? "media (Google Fonts detectado)" : "baja (fallback Inter)";
  const fams = [];
  const fre = /font-family\s*:\s*([^;}]{1,160})/gi;
  let fm;
  while ((fm = fre.exec(html)) && fams.length < 20) fams.push(fm[1].trim());
  const stack = fams.find((f) =>
    /inter|roboto|poppins|montserrat|manrope|dm sans|archivo|jetbrains|space|playfair|serif/i.test(f),
  );
  const body = stack ? stack.split(",")[0].replace(/['"]/g, "").trim() : "Inter";
  const icons = linksHref(html, /apple-touch-icon|icon/i);
  const ogImg = metaContent(html, "property", "og:image");
  const logoCands = [...icons.filter((h) => !/\.ico(\?|$)/i.test(h)).slice(0, 2), ...(ogImg ? [ogImg] : [])].slice(
    0,
    3,
  );
  const brandName = (siteName || (title || "").split(/[|·–—-]/)[0] || new URL(pageUrl).hostname.replace(/^www\./, ""))
    .trim()
    .slice(0, 60);
  return { brandName, title, primary, primarySrc, secondary, lightHit, googleUrl, body, logoCands, conf };
}
export function buildKitFromInference(inf, name, sl) {
  const sec = inf.secondary,
    dark = hexMix(sec, "#000000", 0.45);
  const kit = clone(DEFAULT_KIT);
  kit.name = String(name || inf.brandName || sl).slice(0, 60);
  kit.colors = { primary: inf.primary, secondary: sec, tertiary: "#ffffff", slideBg: hexMix(sec, "#ffffff", 0.08) };
  kit.fonts = {
    heading: `'${inf.body}', system-ui, sans-serif`,
    body: `'${inf.body}', system-ui, sans-serif`,
    googleUrl: inf.googleUrl || DEFAULT_KIT.fonts.googleUrl,
  };
  kit.logo = { letter: (kit.name[0] || "c").toLowerCase(), text: kit.name };
  kit.gradients = [
    { name: "deep", css: `linear-gradient(145deg,${sec},${dark} 70%)` },
    { name: "brand", css: `linear-gradient(145deg,${hexMix(sec, inf.primary, 0.35)},${sec} 60%,${dark})` },
    { name: "accent", css: `linear-gradient(145deg,${inf.primary},${sec} 55%,${dark})` },
    inf.lightHit
      ? {
          name: "light",
          css: `linear-gradient(135deg,${inf.lightHit},${hexMix(inf.lightHit, sec, 0.45)} 60%,${hexMix(sec, "#ffffff", 0.25)})`,
          light: true,
        }
      : { name: "mint", css: "linear-gradient(135deg,#bfe3d8,#dcead2 55%,#5ea3b8)", light: true },
  ];
  return kit;
}
