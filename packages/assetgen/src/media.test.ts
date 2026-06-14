import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeDownloadUrl,
  downloadGeneratedAsset,
  extensionForMediaType,
  mediaTypeFromUrl,
  outputUrl,
} from "./media";

const okBytes = (body = "x") =>
  (async () => new Response(body, { status: 200, headers: { "content-type": "model/gltf-binary" } })) as unknown as typeof fetch;

test("outputUrl finds the first usable URL across provider response shapes", () => {
  assert.equal(outputUrl("https://x.test/a.png"), "https://x.test/a.png");
  assert.equal(outputUrl([null, "https://x.test/b.png"]), "https://x.test/b.png");
  assert.equal(outputUrl({ url: "https://x.test/c.png" }), "https://x.test/c.png");
  assert.equal(outputUrl({ audio_url: "https://x.test/d.mp3" }), "https://x.test/d.mp3");
  assert.equal(outputUrl({ image_url: "https://x.test/e.png" }), "https://x.test/e.png");
  assert.equal(outputUrl({ data: ["https://x.test/f.png"] }), "https://x.test/f.png");
  assert.equal(outputUrl({ output: { url: "https://x.test/g.png" } }), "https://x.test/g.png");
  assert.equal(outputUrl({ output: { data: ["https://x.test/h.png"] } }), "https://x.test/h.png");
  assert.equal(outputUrl({ nothing: true }), undefined);
  assert.equal(outputUrl(42), undefined);
});

test("mediaTypeFromUrl maps known extensions and falls back to octet-stream", () => {
  assert.equal(mediaTypeFromUrl("https://x.test/a.webp"), "image/webp");
  assert.equal(mediaTypeFromUrl("https://x.test/a.jpg"), "image/jpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.jpeg"), "image/jpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.mp3"), "audio/mpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.ogg"), "audio/ogg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.webm"), "audio/webm");
  assert.equal(mediaTypeFromUrl("https://x.test/a.wav"), "audio/wav");
  assert.equal(mediaTypeFromUrl("https://x.test/a.glb"), "model/gltf-binary");
  // .png is deliberately unmapped — image providers send a content-type header.
  assert.equal(mediaTypeFromUrl("https://x.test/a.png"), "application/octet-stream");
});

test("extensionForMediaType maps media types, then sniffs the URL, then bins out", () => {
  assert.equal(extensionForMediaType("image/png"), "png");
  assert.equal(extensionForMediaType("image/webp"), "webp");
  assert.equal(extensionForMediaType("image/jpeg"), "jpg");
  assert.equal(extensionForMediaType("audio/mpeg"), "mp3");
  assert.equal(extensionForMediaType("model/gltf-binary"), "glb");
  assert.equal(extensionForMediaType("application/octet-stream", "https://x.test/file.PNG?sig=abc"), "png");
  assert.equal(extensionForMediaType("application/octet-stream", "https://x.test/file"), "bin");
  assert.equal(extensionForMediaType("text/weird"), "bin");
});

test("downloadGeneratedAsset prefers the content-type header over the URL", async () => {
  const bytes = Buffer.from([1, 2, 3]);
  const fetchImpl = (async () =>
    new Response(bytes, { headers: { "content-type": "image/webp; charset=binary" } })) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://x.test/thing.bin", "some/model", fetchImpl);

  assert.deepEqual(asset.data, bytes);
  assert.equal(asset.mediaType, "image/webp");
  assert.equal(asset.extension, "webp");
  assert.equal(asset.model, "some/model");
});

test("downloadGeneratedAsset sniffs the URL when no content-type header is sent", async () => {
  const fetchImpl = (async () => new Response(Buffer.from([1]))) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://x.test/track.mp3", undefined, fetchImpl);

  assert.equal(asset.mediaType, "audio/mpeg");
  assert.equal(asset.extension, "mp3");
});

test("downloadGeneratedAsset surfaces non-ok responses", async () => {
  const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(downloadGeneratedAsset("https://x.test/a.png", undefined, fetchImpl), /download 404: nope/);
});

test("assertSafeDownloadUrl enforces https, blocks internal hosts, and honors an allowlist", () => {
  // happy paths
  assert.equal(assertSafeDownloadUrl("https://assets.meshy.ai/x.glb").hostname, "assets.meshy.ai");
  assert.equal(assertSafeDownloadUrl("https://assets.meshy.ai/x.glb", ["meshy.ai"]).hostname, "assets.meshy.ai");
  assert.equal(assertSafeDownloadUrl("https://cdn.meshy.ai/x.glb", ["meshy.ai"]).hostname, "cdn.meshy.ai");

  // scheme
  assert.throws(() => assertSafeDownloadUrl("http://assets.meshy.ai/x.glb"), /non-https/);
  assert.throws(() => assertSafeDownloadUrl("file:///etc/passwd"), /non-https/);

  // private / loopback / link-local (incl. cloud metadata) — IPv4, IPv6, localhost, integer-encoded
  for (const url of [
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://172.16.0.1/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data", // cloud metadata endpoint
    "https://[::1]/x",
    "https://[fd00::1]/x",
    // IPv4-mapped IPv6 — new URL() normalizes the embedded IPv4 to hex
    // (e.g. [::ffff:127.0.0.1] -> [::ffff:7f00:1]), so the guard must decode the
    // hex form, not just the dotted spelling.
    "https://[::ffff:127.0.0.1]/x", // loopback via mapped IPv6
    "https://[::ffff:169.254.169.254]/latest/meta-data", // cloud metadata via mapped IPv6
    "https://[::ffff:10.0.0.5]/x", // RFC1918 via mapped IPv6
    "https://[::ffff:192.168.1.1]/x", // RFC1918 via mapped IPv6
    "https://localhost/x",
    "https://2130706433/x", // 127.0.0.1 as a single integer — WHATWG-normalized to dotted-quad
  ]) {
    assert.throws(() => assertSafeDownloadUrl(url), /private\/loopback\/link-local/, url);
  }

  // a PUBLIC IPv4-mapped IPv6 must NOT be over-blocked by the private guard
  assert.equal(assertSafeDownloadUrl("https://[::ffff:8.8.8.8]/x").protocol, "https:");

  // allowlist: off-domain hosts and lookalikes rejected
  assert.throws(() => assertSafeDownloadUrl("https://evil.example.com/x.glb", ["meshy.ai"]), /not an allowed download domain/);
  assert.throws(() => assertSafeDownloadUrl("https://notmeshy.ai/x.glb", ["meshy.ai"]), /not an allowed download domain/);

  // malformed
  assert.throws(() => assertSafeDownloadUrl("not a url"), /malformed URL/);
});

test("downloadGeneratedAsset refuses non-https and internal hosts before fetching (when an allowlist opts in)", async () => {
  const explode = (async () => {
    throw new Error("must not fetch a rejected URL");
  }) as unknown as typeof fetch;
  const allowedHosts = ["meshy.ai"];
  await assert.rejects(
    downloadGeneratedAsset("http://assets.meshy.ai/x.glb", undefined, explode, { allowedHosts }),
    /non-https/,
  );
  await assert.rejects(
    downloadGeneratedAsset("https://169.254.169.254/x", undefined, explode, { allowedHosts }),
    /private\/loopback\/link-local/,
  );
});

test("downloadGeneratedAsset leaves the URL unrestricted when no allowlist is given (fal/replicate path)", async () => {
  // Providers without a host-constrained CDN (fal points at FAL_API_BASE_URL,
  // http://127.0.0.1 in tests) must keep downloading unrestricted.
  const fetchImpl = (async () =>
    new Response("glb", { status: 200, headers: { "content-type": "model/gltf-binary" } })) as unknown as typeof fetch;
  const asset = await downloadGeneratedAsset("http://127.0.0.1:9999/local.glb", undefined, fetchImpl);
  assert.equal(asset.mediaType, "model/gltf-binary");
});

test("downloadGeneratedAsset trusts an operator-configured base origin (self-hosted / e2e endpoint)", async () => {
  // An explicitly-configured *_API_BASE_URL origin bypasses the https/private
  // guards — exactly as create/poll already trust it — so the local e2e mock and
  // self-hosted proxies keep working even on http/127.0.0.1.
  const fetchImpl = (async () =>
    new Response("glb", { status: 200, headers: { "content-type": "model/gltf-binary" } })) as unknown as typeof fetch;
  const asset = await downloadGeneratedAsset("http://127.0.0.1:9999/model.glb", undefined, fetchImpl, {
    allowedHosts: ["meshy.ai"],
    trustedOrigins: ["http://127.0.0.1:9999"],
  });
  assert.equal(asset.mediaType, "model/gltf-binary");
});

test("downloadGeneratedAsset still guards hosts outside the trusted origin", async () => {
  const explode = (async () => {
    throw new Error("must not fetch a rejected URL");
  }) as unknown as typeof fetch;
  // A different origin than the trusted one is still held to the strict guards.
  await assert.rejects(
    downloadGeneratedAsset("http://169.254.169.254/x", undefined, explode, {
      allowedHosts: ["meshy.ai"],
      trustedOrigins: ["http://127.0.0.1:9999"],
    }),
    /non-https/,
  );
});

test("downloadGeneratedAsset enforces an allowedHosts allowlist", async () => {
  await assert.rejects(
    downloadGeneratedAsset("https://evil.example.com/x.glb", undefined, okBytes(), { allowedHosts: ["meshy.ai"] }),
    /not an allowed download domain/,
  );
  const asset = await downloadGeneratedAsset("https://assets.meshy.ai/x.glb", undefined, okBytes(), {
    allowedHosts: ["meshy.ai"],
  });
  assert.equal(asset.mediaType, "model/gltf-binary");
});

test("downloadGeneratedAsset follows a redirect and re-validates each hop", async () => {
  let hops = 0;
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    hops += 1;
    if (url === "https://assets.meshy.ai/start.glb") {
      return new Response(null, { status: 302, headers: { location: "https://cdn.meshy.ai/final.glb" } });
    }
    if (url === "https://cdn.meshy.ai/final.glb") {
      return new Response("glb", { status: 200, headers: { "content-type": "model/gltf-binary" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://assets.meshy.ai/start.glb", undefined, fetchImpl, {
    allowedHosts: ["meshy.ai"],
  });
  assert.equal(asset.mediaType, "model/gltf-binary");
  assert.equal(hops, 2);
});

test("downloadGeneratedAsset rejects a redirect that points at an internal host", async () => {
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    if (url === "https://assets.meshy.ai/start.glb") {
      return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } });
    }
    throw new Error("must not follow a redirect to an internal host");
  }) as unknown as typeof fetch;

  await assert.rejects(
    downloadGeneratedAsset("https://assets.meshy.ai/start.glb", undefined, fetchImpl, { allowedHosts: ["meshy.ai"] }),
    /private\/loopback\/link-local/,
  );
});

test("downloadGeneratedAsset bounds redirect chains", async () => {
  const fetchImpl = (async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://assets.meshy.ai/loop.glb" },
    })) as unknown as typeof fetch;
  await assert.rejects(
    downloadGeneratedAsset("https://assets.meshy.ai/loop.glb", undefined, fetchImpl, { allowedHosts: ["meshy.ai"] }),
    /exceeded \d+ redirects/,
  );
});

test("downloadGeneratedAsset delegates redirect-following to the platform when unguarded (no manual 5-hop cap)", async () => {
  // fal/replicate/suno/beatoven downloads previously used native fetch
  // redirect-following (~20 hops). The hardening must not silently cap them at
  // MAX_DOWNLOAD_REDIRECTS: an unguarded download issues a single fetch with the
  // platform's default redirect handling, not the manual per-hop loop + cap.
  let calls = 0;
  let sawManual = false;
  const fetchImpl = (async (_input: unknown, init?: { redirect?: string }) => {
    calls += 1;
    if (init?.redirect === "manual") sawManual = true;
    return new Response("glb", { status: 200, headers: { "content-type": "model/gltf-binary" } });
  }) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://cdn.example.com/a.glb", undefined, fetchImpl);
  assert.equal(asset.mediaType, "model/gltf-binary");
  assert.equal(calls, 1, "unguarded download must issue exactly one fetch, leaving redirects to the platform");
  assert.equal(sawManual, false, "unguarded download must not force redirect:manual (which caps hops)");
});

test("downloadGeneratedAsset times out a hung fetch via its timeout budget", async () => {
  const fetchImpl = (async (_input: unknown, init?: { signal?: AbortSignal }) =>
    await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal, "download fetch was not given an AbortSignal");
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as unknown as typeof fetch;

  await assert.rejects(
    downloadGeneratedAsset("https://assets.meshy.ai/slow.glb", undefined, fetchImpl, { timeoutMs: 20 }),
    (err: unknown) =>
      err instanceof Error &&
      ((err as { name?: string }).name === "TimeoutError" || /timed out|abort/i.test(err.message)),
  );
});
