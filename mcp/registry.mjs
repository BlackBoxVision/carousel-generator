import generate_carousel from "./tools/generate_carousel.mjs";
import list_carousels from "./tools/list_carousels.mjs";
import load_carousel from "./tools/load_carousel.mjs";
import save_carousel from "./tools/save_carousel.mjs";
import delete_carousel from "./tools/delete_carousel.mjs";
import review_slide_images from "./tools/review_slide_images.mjs";
import set_slide_photo from "./tools/set_slide_photo.mjs";
import edit_slide from "./tools/edit_slide.mjs";
import save_brand_kit from "./tools/save_brand_kit.mjs";
import list_brand_kits from "./tools/list_brand_kits.mjs";
import load_brand_kit from "./tools/load_brand_kit.mjs";
import brand_kit_from_url from "./tools/brand_kit_from_url.mjs";
import carousel_from_url from "./tools/carousel_from_url.mjs";
import import_editor_state from "./tools/import_editor_state.mjs";
import render_preview from "./tools/render_preview.mjs";
import social_copy from "./tools/social_copy.mjs";

export const tools = [
  generate_carousel,
  list_carousels,
  load_carousel,
  save_carousel,
  delete_carousel,
  review_slide_images,
  set_slide_photo,
  edit_slide,
  save_brand_kit,
  list_brand_kits,
  load_brand_kit,
  brand_kit_from_url,
  carousel_from_url,
  import_editor_state,
  render_preview,
  social_copy,
];

const byName = new Map(tools.map((t) => [t.name, t]));

export function getTool(name) {
  return byName.get(name) || null;
}

export function listToolsForRpc() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function callTool(name, args) {
  const tool = byName.get(name);
  if (!tool) throw new Error(`Herramienta desconocida: ${name}`);
  const result = await tool.handler(args || {});
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
