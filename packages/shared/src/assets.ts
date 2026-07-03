export const ASSET_BASE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_ASSET_BASE_URL",
  "ASSET_BASE_URL",
  "VITE_ASSET_BASE_URL",
] as const;

export type AssetBaseUrlEnvKey = (typeof ASSET_BASE_URL_ENV_KEYS)[number];

export interface AssetOriginEnv {
  [key: string]: string | undefined;
}

export function normalizeAssetBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`invalid asset base URL: ${trimmed}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`asset base URL must use http(s): ${trimmed}`);
  }

  return url.toString().replace(/\/+$/, "");
}

export function readAssetBaseUrl(
  env: AssetOriginEnv,
  keys: readonly AssetBaseUrlEnvKey[] = ASSET_BASE_URL_ENV_KEYS,
): string | null {
  for (const key of keys) {
    const value = normalizeAssetBaseUrl(env[key]);
    if (value) return value;
  }
  return null;
}

export function isHttpAssetUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function resolveAssetUrl(sourcePath: string | null | undefined, assetBaseUrl: string | null | undefined): string | null {
  if (!sourcePath) return null;
  if (isHttpAssetUrl(sourcePath)) return sourcePath;
  const base = normalizeAssetBaseUrl(assetBaseUrl);
  if (!base) return null;
  return `${base}/${sourcePath.replace(/^\/+/, "")}`;
}
