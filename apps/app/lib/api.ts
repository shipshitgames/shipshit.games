import { auth } from "@clerk/nextjs/server";

// Server-side client for api.shipshit.games. Forwards the caller's Clerk
// session JWT so the API authenticates the actual user, not this server.
const API_URL = process.env.API_URL ?? "http://localhost:3003";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** The app serves gallery images from its own origin; map API records to local URLs. */
export function withLocalAssetUrls<T extends { id: string }>(assets: T[]): (T & { url: string })[] {
  return assets.map((asset) => ({ ...asset, url: `/api/assets/file/${asset.id}` }));
}
