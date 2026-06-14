/**
 * Shared download + media-type helpers for HTTP-based asset providers.
 * Kept free of heavy deps (sharp, node-pty) so the desktop main process can
 * import provider catalogs without dragging native modules into its bundle.
 */

/** Model-catalog entry shared by providers; kept here so it stays dependency-free. */
export interface ProviderModel {
  id: string;
  label: string;
  kinds: readonly string[];
}

/**
 * Reproducibility hints a provider reports for a single generation (issue #55).
 * `reproducible` is true only when a seedable provider honored a seed; the
 * pipeline folds this into the manifest's provenance record.
 */
export interface GeneratedAssetMeta {
  model?: string;
  modelVersion?: string;
  seed?: number;
  requestId?: string;
  reproducible: boolean;
}

export interface GeneratedAsset {
  data: Buffer;
  mediaType: string;
  extension: string;
  model?: string;
  /** Provider reproducibility metadata (model/seed/requestId/reproducible). */
  meta?: GeneratedAssetMeta;
  /** Provenance for generated media — commercial rights are plan-dependent for some providers. */
  license?: {
    type?: string;
    terms?: string;
    url?: string;
    generatedAt?: string;
  };
}

/** Per-request timeout / overall budget for a download when the caller sets none. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
/** Cap redirect hops so a misbehaving or hostile CDN can't loop the download forever. */
const MAX_DOWNLOAD_REDIRECTS = 5;

export interface DownloadOptions {
  /**
   * Per-request timeout, reused as the overall wall-clock budget across any
   * redirect hops. Without it a hung CDN connection blocks indefinitely — the
   * provider task's `timeoutMs` only bounds the poll loop, never this download.
   */
  timeoutMs?: number;
  /**
   * Host allowlist (suffix-matched on the registrable domain). Supplying it opts
   * the download into the SSRF guards: the URL — and every redirect hop — must be
   * https, must not resolve to a private/loopback/link-local host, and must match
   * one of these domains. Omitted (the default for providers whose download URLs
   * aren't host-constrained, e.g. fal/replicate) leaves the URL unrestricted.
   */
  allowedHosts?: readonly string[];
  /**
   * Origins (`scheme://host:port`) that bypass the guards because the operator
   * explicitly configured them — e.g. a self-hosted or proxied provider endpoint
   * set via `*_API_BASE_URL`. A download served from the same origin as a
   * configured endpoint is trusted exactly like the create/poll calls already
   * are; the default production CDNs go through `allowedHosts`, not this.
   */
  trustedOrigins?: readonly string[];
}

/** RFC1918 / loopback / link-local / CGNAT / unspecified IPv4 — never fetch these. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false; // not a valid dotted-quad
  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (incl. cloud metadata 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 CGNAT
  );
}

/**
 * Extract the embedded IPv4 of an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`),
 * as a dotted quad. Handles BOTH the dotted-decimal spelling and the hex form
 * the WHATWG `URL` parser actually emits: `new URL("https://[::ffff:127.0.0.1]")`
 * normalizes the host to `[::ffff:7f00:1]`, so the dotted form never survives and
 * a dotted-only check is dead code. Returns null when `h` is not a mapped address.
 */
function mappedIpv4(h: string): string | null {
  const rest = /^::ffff:(.+)$/.exec(h)?.[1];
  if (!rest) return null;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rest)) return rest; // ::ffff:10.0.0.1
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest); // ::ffff:a00:5  (i.e. 10.0.0.5)
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** Loopback / unique-local / link-local / unspecified IPv6 (handles [brackets] + IPv4-mapped). */
function isPrivateIpv6(host: string): boolean {
  let h = host.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
  const embedded = mappedIpv4(h); // ::ffff:a.b.c.d — dotted or the hex form URL() emits
  return embedded ? isPrivateIpv4(embedded) : false;
}

function hostInAllowlist(host: string, allowed: readonly string[]): boolean {
  return allowed.some((domain) => {
    const d = domain.toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  });
}

/**
 * Guard a download URL before we hit the network: rejects non-https and
 * private/loopback/link-local hosts (the high-severity SSRF targets: cloud
 * metadata, internal services) and pins the host to one of `allowedHosts`.
 * Returns the parsed URL. Callers opt in by passing an allowlist. An origin in
 * `trustedOrigins` (an operator-configured `*_API_BASE_URL`) bypasses the checks.
 */
export function assertSafeDownloadUrl(
  url: string,
  allowedHosts?: readonly string[],
  trustedOrigins?: readonly string[],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`download: malformed URL ${JSON.stringify(url)}`);
  }
  if (trustedOrigins && trustedOrigins.includes(parsed.origin)) return parsed; // operator-configured endpoint
  if (parsed.protocol !== "https:") {
    throw new Error(`download: refusing non-https URL (${parsed.protocol}) for ${parsed.host || url}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error(`download: refusing private/loopback/link-local host ${parsed.hostname}`);
  }
  if (allowedHosts && allowedHosts.length > 0 && !hostInAllowlist(host, allowedHosts)) {
    throw new Error(
      `download: host ${host} is not an allowed download domain (${allowedHosts.join(", ")}). ` +
        `If the provider rotated CDNs, extend the provider's *_DOWNLOAD_HOSTS env var.`,
    );
  }
  return parsed;
}

/**
 * Fetch a download URL within a timeout budget (always applied — a hung CDN
 * connection must not block forever). Two redirect strategies:
 *
 * - Unguarded callers (no allowlist/trusted origin — fal/replicate/suno/beatoven)
 *   keep the platform's native redirect-following, exactly as the pre-hardening
 *   `fetch(url)` did, so a vendor CDN that legitimately chains several hops is not
 *   silently capped at {@link MAX_DOWNLOAD_REDIRECTS}; only the timeout is added.
 * - Guarded callers (meshy/tripo) follow redirects manually so the SSRF guard
 *   re-checks every hop — including a CDN 302 to an internal address — and the
 *   chain is capped so a hostile CDN can't loop the download forever.
 */
async function fetchDownload(url: string, fetchImpl: typeof fetch, options: DownloadOptions): Promise<Response> {
  const { timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS, allowedHosts, trustedOrigins } = options;
  const guarded = (allowedHosts && allowedHosts.length > 0) || (trustedOrigins && trustedOrigins.length > 0);
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const budget = (): number => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`download: timed out after ${timeoutMs}ms`);
    return remaining;
  };

  if (!guarded) {
    // Native redirect-following (default), preserving the unguarded providers'
    // prior behavior; the single signal still bounds the whole chain + body read.
    return fetchImpl(url, { signal: AbortSignal.timeout(budget()) });
  }

  const guard = (u: string) => assertSafeDownloadUrl(u, allowedHosts, trustedOrigins);
  let current = url;
  guard(current);
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(budget()) });
    if (res.status < 300 || res.status >= 400) return res; // not a redirect — hand back to caller
    const location = res.headers.get("location");
    if (!location) return res; // 3xx without a Location: let the !ok check surface it
    if (hop >= MAX_DOWNLOAD_REDIRECTS) throw new Error(`download: exceeded ${MAX_DOWNLOAD_REDIRECTS} redirects`);
    current = new URL(location, current).toString();
    guard(current);
  }
}

export async function downloadGeneratedAsset(
  url: string,
  model?: string,
  fetchImpl: typeof fetch = fetch,
  options: DownloadOptions = {},
): Promise<GeneratedAsset> {
  const res = await fetchDownload(url, fetchImpl, options);
  if (!res.ok) throw new Error(`download ${res.status}: ${await res.text()}`);
  const mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() || mediaTypeFromUrl(url);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mediaType,
    extension: extensionForMediaType(mediaType, url),
    model,
  };
}

export function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((item): item is string => typeof item === "string");
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const direct = obj.audio_url ?? obj.audioUrl ?? obj.image_url ?? obj.imageUrl ?? obj.url;
    if (typeof direct === "string") return direct;
    if (Array.isArray(obj.data)) return outputUrl(obj.data);
    if (obj.output) return outputUrl(obj.output);
  }
  return undefined;
}

export function mediaTypeFromUrl(url: string): string {
  if (url.endsWith(".webp")) return "image/webp";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  if (url.endsWith(".mp3")) return "audio/mpeg";
  if (url.endsWith(".ogg")) return "audio/ogg";
  if (url.endsWith(".webm")) return "audio/webm";
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

export function extensionForMediaType(mediaType: string, url = ""): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "audio/mpeg") return "mp3";
  if (mediaType === "audio/ogg") return "ogg";
  if (mediaType === "audio/webm") return "webm";
  if (mediaType === "audio/wav") return "wav";
  if (mediaType === "model/gltf-binary") return "glb";
  const match = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() ?? "bin";
}
