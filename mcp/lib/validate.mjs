import Ajv from "ajv";

/**
 * Builds a strict copy of a JSON Schema for runtime validation:
 * - root always gets additionalProperties: false
 * - nested objects that declare `properties` get additionalProperties: false
 * - bare { type: "object" } without properties stay open (freeform bags like carousel/kit/meta)
 * - does not mutate the original schema (tools/list / manifest keep the published shape)
 */
function strictSchema(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const out = { ...node };
  const isObjectish = out.type === "object" || out.properties !== undefined;
  if (isObjectish && out.properties) {
    if (!("additionalProperties" in out)) out.additionalProperties = false;
  }
  if (out.properties && typeof out.properties === "object") {
    const props = {};
    for (const [k, v] of Object.entries(out.properties)) props[k] = strictSchema(v);
    out.properties = props;
  }
  if (out.items !== undefined) {
    out.items = Array.isArray(out.items) ? out.items.map(strictSchema) : strictSchema(out.items);
  }
  // type can be an array (e.g. ["object","string"]) — leave as-is
  return out;
}

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function formatType(expected) {
  if (Array.isArray(expected)) return expected.join(" o ");
  return String(expected);
}

function formatEnum(values) {
  return (values || []).map((v) => String(v)).join(", ");
}

function messageForError(err, args) {
  const path = (err.instancePath || "").replace(/^\//, "").replace(/\//g, ".");
  const where = path ? `\`${path}\`` : "arguments";
  const keyword = err.keyword;

  if (keyword === "required") {
    return `Falta ${err.params.missingProperty} (requerido).`;
  }
  if (keyword === "type") {
    const received = path
      ? // best-effort: walk the path to the actual value
        (() => {
          let cur = args;
          for (const seg of path.split(".")) {
            if (cur === null || typeof cur !== "object") return typeName(cur);
            cur = cur[seg];
          }
          return typeName(cur);
        })()
      : typeName(args);
    return `${where} debe ser ${formatType(err.params.type)} (recibido: ${received}).`;
  }
  if (keyword === "enum") {
    return `${where} debe ser uno de: ${formatEnum(err.params.allowedValues)}.`;
  }
  if (keyword === "additionalProperties") {
    return `Propiedad no permitida: ${err.params.additionalProperty}${path ? ` en ${where}` : ""}.`;
  }
  if (keyword === "required" && err.params && err.params.missingProperty) {
    return `Falta ${err.params.missingProperty} (requerido) en ${where}.`;
  }
  // fallback
  return `${where}: ${err.message}${err.params && err.params.allowedValues ? ` (${formatEnum(err.params.allowedValues)})` : ""}.`;
}

/**
 * Compile validators for a list of tools: { name, inputSchema }.
 * Returns a Map<name, (args) => true | never> — throws Error with Spanish message.
 */
export function compileValidators(tools) {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  const map = new Map();
  for (const tool of tools) {
    const schema = strictSchema(tool.inputSchema);
    // ensure root is object schema with additionalProperties:false even if properties missing
    if (schema && typeof schema === "object") {
      if (!schema.type) schema.type = "object";
      if ((schema.type === "object" || schema.properties) && !("additionalProperties" in schema)) {
        schema.additionalProperties = false;
      }
    }
    const validate = ajv.compile(schema);
    map.set(tool.name, (args) => {
      const ok = validate(args);
      if (ok) return true;
      const msgs = (validate.errors || []).map((e) => messageForError(e, args));
      // de-dupe while preserving order
      const unique = [...new Set(msgs)];
      throw new Error(unique.join("; "));
    });
  }
  return map;
}

/**
 * Validate args against a tool's inputSchema. Throws Error (Spanish) on failure.
 * Returns true on success.
 */
export function makeValidator(tools) {
  const validators = compileValidators(tools);
  return function validateArgs(name, args) {
    const fn = validators.get(name);
    if (!fn) throw new Error(`Herramienta desconocida: ${name}`);
    return fn(args && typeof args === "object" && !Array.isArray(args) ? args : {});
  };
}
