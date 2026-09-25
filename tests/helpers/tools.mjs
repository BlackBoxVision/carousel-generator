/**
 * Canonical checklist of the 22 MCP tools, independent from mcp/registry.mjs
 * on purpose: it is the drift guard. Adding a tool means updating this list
 * (and the README table), otherwise tests/integration/docs.test.mjs fails.
 */
export const EXPECTED_TOOL_NAMES = [
  "generate_carousel",
  "list_carousels",
  "load_carousel",
  "save_carousel",
  "delete_carousel",
  "duplicate_carousel",
  "export_pdf",
  "delete_brand_kit",
  "review_slide_images",
  "set_slide_photo",
  "edit_slide",
  "set_slide_bg",
  "set_carousel_meta",
  "validate_carousel",
  "save_brand_kit",
  "list_brand_kits",
  "load_brand_kit",
  "brand_kit_from_url",
  "carousel_from_url",
  "import_editor_state",
  "render_preview",
  "social_copy",
];

export const EXPECTED_TOOL_COUNT = EXPECTED_TOOL_NAMES.length;
