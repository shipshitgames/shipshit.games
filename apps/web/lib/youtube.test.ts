import { describe, expect, test } from "bun:test";

import { parseFeedEntries } from "./youtube";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Ship Shit Show</title>
  <entry>
    <id>yt:video:abc123DEF45</id>
    <yt:videoId>abc123DEF45</yt:videoId>
    <title>We Built a Browser FPS &amp; Shipped It</title>
    <published>2026-06-04T12:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>xyz789GHI01</yt:videoId>
    <title>Live Masterclass</title>
    <published>2026-06-03T12:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>missing-title-entry</yt:videoId>
    <published>2026-06-02T12:00:00+00:00</published>
    <title></title>
  </entry>
</feed>`;

describe("parseFeedEntries", () => {
  test("extracts id, decoded title, and published date", () => {
    const videos = parseFeedEntries(FEED, 10);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      videoId: "abc123DEF45",
      title: "We Built a Browser FPS & Shipped It",
      published: "2026-06-04T12:00:00+00:00",
    });
  });

  test("respects the limit", () => {
    expect(parseFeedEntries(FEED, 1)).toHaveLength(1);
  });

  test("returns empty for non-feed input", () => {
    expect(parseFeedEntries("<html>not a feed</html>", 5)).toHaveLength(0);
  });
});
