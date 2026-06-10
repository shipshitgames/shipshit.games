/**
 * Latest channel uploads via the key-free YouTube RSS feed, with ISR.
 * Falls back to the curated featured list from site-meta.json. Server
 * components only.
 */
import { SITE_META } from "@/lib/content";
import type { LatestVideo } from "@/lib/content/types";

const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 5000;

/** Parse YouTube channel RSS entries without an XML dependency. */
export function parseFeedEntries(xml: string, limit: number): LatestVideo[] {
  const videos: LatestVideo[] = [];
  const entries = xml.split("<entry>").slice(1);
  for (const entry of entries) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!videoId || !title || !published) continue;
    videos.push({ videoId, title: decodeXmlEntities(title), published });
    if (videos.length >= limit) break;
  }
  return videos;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function fallbackVideos(limit: number): LatestVideo[] {
  return SITE_META.youtubeFeatured
    .slice(0, limit)
    .map(({ videoId, title, published }) => ({ videoId, title, published }));
}

export async function fetchLatestVideos(limit = 6): Promise<{ videos: LatestVideo[]; live: boolean }> {
  const channelId = SITE_META.youtubeChannelId;
  if (process.env.CONTENT_SNAPSHOT_ONLY === "1" || !channelId) {
    return { videos: fallbackVideos(limit), live: false };
  }
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const videos = parseFeedEntries(await res.text(), limit);
    if (videos.length === 0) throw new Error("empty feed");
    return { videos, live: true };
  } catch {
    return { videos: fallbackVideos(limit), live: false };
  }
}
