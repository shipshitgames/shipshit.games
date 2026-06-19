/**
 * Minimal, dependency-free JSON Schema validator covering the subset of
 * draft 2020-12 used by the checked-in manifest schemas in `schemas/`.
 *
 * Supported keywords: `type`, `const`, `enum`, `required`, `properties`,
 * `additionalProperties` (boolean), `items`, `pattern`, `minLength`,
 * `minItems`. Metadata keywords (`$schema`, `$id`, `title`, `description`,
 * `$comment`) are tolerated and ignored.
 *
 * This is the single shape-validation path for `validateLibrary`: the schema
 * files are the source of truth, replacing hand-rolled field checks that had
 * drifted weaker than the published schemas (issue #200). The package ships
 * zero runtime dependencies, so we interpret the schema rather than pull in a
 * full validator. The schemas are trusted, checked-in files (never user input),
 * so `pattern` regexes are compiled directly; `collectUnsupportedKeywords`
 * guards against a schema later declaring a keyword this subset cannot enforce
 * (which would silently let validation drift weaker than the schema again).
 */

export type JsonSchema = {
  type?: "object" | "array" | "string" | "boolean" | "number" | "integer" | "null";
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  pattern?: string;
  minLength?: number;
  minItems?: number;
  /** Metadata keywords ($schema, $id, title, …) are accepted but ignored. */
  [keyword: string]: unknown;
};

/** Keywords `validateValue` actually enforces. */
export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "pattern",
  "minLength",
  "minItems",
]);

/** Non-constraint keywords that are safe to ignore. */
const METADATA_KEYWORDS: ReadonlySet<string> = new Set(["$schema", "$id", "title", "description", "$comment"]);

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

/** Discriminates array vs object vs primitive in a JSON-aware way. */
function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: NonNullable<JsonSchema["type"]>): boolean {
  switch (type) {
    case "object":
      return kindOf(value) === "object";
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

/** Equality for `const`/`enum` members; primitives by identity, else structural. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function childPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/**
 * Validate `value` against `schema`, returning a flat list of human-readable
 * error messages prefixed with `path`. An empty array means the value is valid.
 */
export function validateValue(value: unknown, schema: JsonSchema, path = ""): string[] {
  const errors: string[] = [];
  const at = path || "(root)";

  if (typeof schema.type === "string" && !matchesType(value, schema.type)) {
    errors.push(`${at} must be of type ${schema.type} (got ${kindOf(value)})`);
    return errors; // downstream keyword checks assume the declared type holds
  }

  if ("const" in schema && !sameValue(value, schema.const)) {
    errors.push(`${at} must equal ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => sameValue(option, value))) {
    errors.push(`${at} must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${at} must be at least ${schema.minLength} character(s) long`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${at} must match pattern ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    const base = path || "(root)";
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${at} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateValue(item, schema.items as JsonSchema, `${base}[${index}]`));
      });
    }
  }

  // Container keywords (required/additionalProperties/properties) only fire on a
  // real object; schemas that declare them also declare `type: "object"`, whose
  // mismatch returns early above, so a wrong-typed value never slips past silently.
  if (kindOf(value) === "object") {
    const object = value as Record<string, unknown>;
    const properties = schema.properties ?? {};

    for (const key of schema.required ?? []) {
      if (!hasOwn(object, key)) errors.push(`${childPath(path, key)} is required`);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!hasOwn(properties, key)) errors.push(`${childPath(path, key)} is not an allowed property`);
      }
    }

    for (const [key, subschema] of Object.entries(properties)) {
      if (hasOwn(object, key)) {
        errors.push(...validateValue(object[key], subschema, childPath(path, key)));
      }
    }
  }

  return errors;
}

/**
 * Recursively collect schema keywords this validator does not interpret, so a
 * schema can never silently enforce *less* than it declares — the drift #200
 * closed. Returns dotted keyword paths; an empty array means the schema stays
 * within the supported subset.
 */
export function collectUnsupportedKeywords(schema: JsonSchema, path = ""): string[] {
  const unsupported: string[] = [];
  if (kindOf(schema) !== "object") return unsupported;

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key) && !METADATA_KEYWORDS.has(key)) {
      unsupported.push(path ? `${path}.${key}` : key);
    }
  }

  if (schema.properties && kindOf(schema.properties) === "object") {
    for (const [key, subschema] of Object.entries(schema.properties)) {
      unsupported.push(...collectUnsupportedKeywords(subschema, path ? `${path}.properties.${key}` : `properties.${key}`));
    }
  }

  if (schema.items && kindOf(schema.items) === "object") {
    unsupported.push(...collectUnsupportedKeywords(schema.items, path ? `${path}.items` : "items"));
  }

  return unsupported;
}
