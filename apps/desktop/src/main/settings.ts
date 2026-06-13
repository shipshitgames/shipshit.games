// Pure settings logic (defaults + normalization) kept free of electron imports
// so bun test can exercise it directly, like game-slugs.ts. index.ts owns the
// settings.json read/write around these.
import { uniqueProjects } from "./projects";
// Same direct-from-TS-source import shape as index.ts's manifest.ts import —
// fal.ts is bundle-safe for the Electron main process (no sharp/node-pty).
import { FAL_IMAGE_KINDS } from "../../../../packages/assetgen/src/fal.ts";

const DEFAULT_GAME = "scourge-survivors";
const PROVIDERS = new Set(["codex", "openai", "fal", "replicate", "suno", "elevenlabs", "beatoven", "mock"]);
const DEFAULT_PROVIDER_BY_KIND = {
  sprite: "codex",
  texture: "openai",
  icon: "openai",
  map: "codex",
  music: "suno",
  sfx: "suno",
  voice: "suno",
  model: "replicate",
  "3d": "replicate",
};
const DEFAULTS = {
  defaultProvider: "codex",
  defaultGame: DEFAULT_GAME,
  providerDefaults: DEFAULT_PROVIDER_BY_KIND,
  activeProjectId: "",
  projects: [],
  falModelDefaults: {},
};

// Per-kind fal model overrides. Keys are restricted to fal's image kinds, but
// values stay free-form (trimmed): BYO custom model ids are allowed, not just
// the curated FAL_MODELS catalog.
function normalizeFalModelDefaults(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const kind of FAL_IMAGE_KINDS) {
    const value = typeof raw[kind] === "string" ? raw[kind].trim() : "";
    if (value) out[kind] = value;
  }
  return out;
}

function normalizeSettings(raw) {
  const providerDefaults = { ...DEFAULT_PROVIDER_BY_KIND, ...(raw?.providerDefaults || {}) };
  for (const [kind, provider] of Object.entries(providerDefaults) as [string, string][]) {
    providerDefaults[kind] = PROVIDERS.has(provider) ? provider : (DEFAULT_PROVIDER_BY_KIND[kind] || "codex");
  }
  const projects = uniqueProjects(Array.isArray(raw?.projects) ? raw.projects : []);
  const activeProjectId = typeof raw?.activeProjectId === "string" ? raw.activeProjectId : "";
  return {
    defaultProvider: PROVIDERS.has(raw?.defaultProvider) ? raw.defaultProvider : "codex",
    defaultGame: typeof raw?.defaultGame === "string" ? raw.defaultGame : DEFAULT_GAME,
    providerDefaults,
    activeProjectId,
    projects,
    falModelDefaults: normalizeFalModelDefaults(raw?.falModelDefaults),
  };
}

function providerForKind(settings, kind, explicit) {
  if (explicit && PROVIDERS.has(explicit)) return explicit;
  return settings.providerDefaults?.[kind] || settings.defaultProvider || DEFAULT_PROVIDER_BY_KIND[kind] || "codex";
}

export { DEFAULT_GAME, DEFAULTS, DEFAULT_PROVIDER_BY_KIND, PROVIDERS, normalizeSettings, providerForKind };
