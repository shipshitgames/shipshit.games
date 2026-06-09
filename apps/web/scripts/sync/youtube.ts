const CHANNEL_URL = "https://www.youtube.com/@ShipShitShow";

/**
 * Resolve the UC… channel id for the studio channel once during sync.
 * The RSS feed (lib/youtube.ts) needs the id, not the handle. Returns null on
 * any failure — the site then falls back to the curated featured list.
 */
export async function resolveChannelId(): Promise<string | null> {
  try {
    const res = await fetch(CHANNEL_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "shipshitgames-sync/1.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{10,})"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
