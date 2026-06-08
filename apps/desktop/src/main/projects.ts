import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ENGINE_ASSETS_MANIFEST_SCHEMA from "../../../../packages/engine/src/assets/assets-manifest.schema.json";

const MANIFEST_RELATIVE_PATH = path.join("src", "assets", "assets.json");
const CATALOG_LIMIT = 80;
const REQUIRED_ASSET_FIELDS = ENGINE_ASSETS_MANIFEST_SCHEMA?.properties?.assets?.items?.required || ["id", "kind", "path"];

function slugify(value) {
  return String(value || "game")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game";
}

function idForRepoPath(repoPath) {
  return `local-${crypto.createHash("sha1").update(path.resolve(repoPath)).digest("hex").slice(0, 12)}`;
}

function manifestPathForRepo(repoPath) {
  return path.join(path.resolve(repoPath), MANIFEST_RELATIVE_PATH);
}

function normalizeProjectRecord(raw, source = "registered") {
  if (!raw || typeof raw.repoPath !== "string" || !raw.repoPath.trim()) return null;
  const repoPath = path.resolve(raw.repoPath);
  const slug = slugify(raw.slug || path.basename(repoPath));
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : idForRepoPath(repoPath),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : slug,
    slug,
    repoPath,
    source,
  };
}

function projectFromRepoPath(repoPath, overrides: any = {}) {
  return normalizeProjectRecord({ ...overrides, repoPath }, overrides.source || "registered");
}

function uniqueProjects(projects) {
  const seen = new Set();
  const out = [];
  for (const project of projects) {
    const normalized = normalizeProjectRecord(project, project?.source || "registered");
    if (!normalized) continue;
    const key = path.resolve(normalized.repoPath);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function validateAssetEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return `assets[${index}] must be an object`;
  }
  for (const field of REQUIRED_ASSET_FIELDS) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      return `assets[${index}].${field} must be a non-empty string`;
    }
  }
  if (entry.game !== undefined && typeof entry.game !== "string") {
    return `assets[${index}].game must be a string when present`;
  }
  if (entry.prompt !== undefined && typeof entry.prompt !== "string") {
    return `assets[${index}].prompt must be a string when present`;
  }
  if (entry.provider !== undefined && typeof entry.provider !== "string") {
    return `assets[${index}].provider must be a string when present`;
  }
  return null;
}

function validateAssetsManifestData(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["manifest root must be an object"], assets: [] };
  }
  if (!Array.isArray(data.assets)) {
    return { valid: false, errors: ["manifest.assets must be an array"], assets: [] };
  }
  for (let i = 0; i < data.assets.length; i += 1) {
    const error = validateAssetEntry(data.assets[i], i);
    if (error) errors.push(error);
  }
  return { valid: errors.length === 0, errors, assets: errors.length ? [] : data.assets };
}

function readAssetsManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return {
      exists: false,
      valid: false,
      error: `Missing ${MANIFEST_RELATIVE_PATH}`,
      errors: [`Missing ${MANIFEST_RELATIVE_PATH}`],
      assets: [],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      exists: true,
      valid: false,
      error: `Invalid JSON: ${error.message}`,
      errors: [`Invalid JSON: ${error.message}`],
      assets: [],
    };
  }
  const validation = validateAssetsManifestData(parsed);
  return {
    exists: true,
    valid: validation.valid,
    error: validation.errors[0] || null,
    errors: validation.errors,
    assets: validation.assets,
  };
}

function summarizeAssets(assets) {
  const kindCounts = {};
  for (const asset of assets) {
    kindCounts[asset.kind] = (kindCounts[asset.kind] || 0) + 1;
  }
  return {
    kindCounts,
    assets: assets.slice(0, CATALOG_LIMIT).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
      game: asset.game || null,
    })),
    catalogTruncated: assets.length > CATALOG_LIMIT,
  };
}

function summarizeProject(project, activeProjectId) {
  const normalized = normalizeProjectRecord(project, project?.source || "registered");
  if (!normalized) return null;
  const manifestPath = manifestPathForRepo(normalized.repoPath);
  const repoExists = fs.existsSync(normalized.repoPath);
  if (!repoExists) {
    return {
      ...normalized,
      manifestPath,
      isActive: normalized.id === activeProjectId,
      exists: false,
      valid: false,
      error: "Repository path does not exist",
      errors: ["Repository path does not exist"],
      assetCount: 0,
      kindCounts: {},
      assets: [],
      catalogTruncated: false,
    };
  }
  const manifest = readAssetsManifest(manifestPath);
  const catalog = summarizeAssets(manifest.assets);
  return {
    ...normalized,
    manifestPath,
    isActive: normalized.id === activeProjectId,
    exists: true,
    valid: manifest.valid,
    error: manifest.error,
    errors: manifest.errors,
    assetCount: manifest.assets.length,
    ...catalog,
  };
}

export {
  CATALOG_LIMIT,
  MANIFEST_RELATIVE_PATH,
  idForRepoPath,
  manifestPathForRepo,
  normalizeProjectRecord,
  projectFromRepoPath,
  readAssetsManifest,
  slugify,
  summarizeProject,
  uniqueProjects,
  validateAssetsManifestData,
};
