import { auth } from "@clerk/nextjs/server";
export { withLocalAssetUrls } from "./asset-urls";

// Server-side client for api.shipshit.games. Forwards the caller's Clerk
// session JWT so the API authenticates the actual user, not this server.
const API_URL = process.env.API_URL ?? "http://localhost:3005";

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
