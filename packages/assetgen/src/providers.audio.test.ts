import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assetProviders,
  elevenLabsSfxRequest,
  generateBeatoven,
  generateElevenLabs,
  resolveProvider,
} from "./providers.ts";
import type { ProviderOptions } from "./providers.ts";

const opts: ProviderOptions = { size: "256x256" };

test("generateMock returns a valid WAV for audio kinds, png for sprite", async () => {
  for (const kind of ["sfx", "music"]) {
    const asset = await assetProviders.mock.generate(kind, "noise", opts);
    assert.equal(asset.mediaType, "audio/wav");
    assert.equal(asset.extension, "wav");
    assert.equal(asset.data.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(asset.data.subarray(8, 12).toString("ascii"), "WAVE");
  }
  const sprite = await assetProviders.mock.generate("sprite", "a husk", opts);
  assert.equal(sprite.mediaType, "image/png");
  assert.equal(sprite.extension, "png");
});

test("elevenLabsSfxRequest builds the right url, header, and body", () => {
  const req = elevenLabsSfxRequest("metallic clang", "secret-key", opts);
  assert.equal(req.url, "https://api.elevenlabs.io/v1/sound-generation");
  assert.equal(req.headers["xi-api-key"], "secret-key");
  assert.equal(req.headers["content-type"], "application/json");
  assert.equal(req.headers.accept, "audio/mpeg");
  assert.deepEqual(JSON.parse(req.body), { text: "metallic clang" });
});

test("generateElevenLabs returns audio/mpeg from an injected fetch", async () => {
  let calledUrl: string | undefined;
  const asset = await generateElevenLabs("sfx", "thud", opts, {
    getKeyImpl: () => "k",
    fetchImpl: (async (url: string) => {
      calledUrl = url;
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal(calledUrl, "https://api.elevenlabs.io/v1/sound-generation");
  assert.equal(asset.mediaType, "audio/mpeg");
  assert.equal(asset.extension, "mp3");
  assert.ok(asset.data.length > 0);
});

test("generateElevenLabs rejects when no key is available", async () => {
  await assert.rejects(
    () =>
      generateElevenLabs("sfx", "thud", opts, {
        getKeyImpl: () => undefined,
        fetchImpl: (async () => new Response(new Uint8Array([1]), { status: 200 })) as unknown as typeof fetch,
      }),
    /ElevenLabs/,
  );
});

test("generateBeatoven downloads the track via injected deps", async () => {
  const prev = process.env.BEATOVEN_API_BASE_URL;
  process.env.BEATOVEN_API_BASE_URL = "https://beatoven.test/compose";
  try {
    const asset = await generateBeatoven("music", "calm theme", opts, {
      getKeyImpl: () => "k",
      fetchImpl: (async (url: string) => {
        if (url === "https://beatoven.test/compose") {
          return new Response(JSON.stringify({ audio_url: "https://cdn.beatoven.test/track.webm" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(new Uint8Array([10, 20, 30]), {
          status: 200,
          headers: { "content-type": "audio/webm" },
        });
      }) as unknown as typeof fetch,
    });
    assert.equal(asset.mediaType, "audio/webm");
    assert.ok(asset.data.length > 0);
  } finally {
    if (prev === undefined) delete process.env.BEATOVEN_API_BASE_URL;
    else process.env.BEATOVEN_API_BASE_URL = prev;
  }
});

test("generateBeatoven rejects when the base url env is missing", async () => {
  const prev = process.env.BEATOVEN_API_BASE_URL;
  delete process.env.BEATOVEN_API_BASE_URL;
  try {
    await assert.rejects(
      () =>
        generateBeatoven("music", "calm theme", opts, {
          getKeyImpl: () => "k",
          fetchImpl: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
        }),
      /BEATOVEN_API_BASE_URL/,
    );
  } finally {
    if (prev !== undefined) process.env.BEATOVEN_API_BASE_URL = prev;
  }
});

test("generateBeatoven rejects when no key is available", async () => {
  const prev = process.env.BEATOVEN_API_BASE_URL;
  process.env.BEATOVEN_API_BASE_URL = "https://beatoven.test/compose";
  try {
    await assert.rejects(
      () =>
        generateBeatoven("music", "calm theme", opts, {
          getKeyImpl: () => undefined,
          fetchImpl: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
        }),
      /Beatoven/,
    );
  } finally {
    if (prev === undefined) delete process.env.BEATOVEN_API_BASE_URL;
    else process.env.BEATOVEN_API_BASE_URL = prev;
  }
});

test("resolveProvider maps the new audio providers to their supported kinds", () => {
  assert.equal(resolveProvider("sfx", "elevenlabs").id, "elevenlabs");
  assert.equal(resolveProvider("music", "beatoven").id, "beatoven");
  assert.throws(() => resolveProvider("music", "elevenlabs"), /elevenlabs does not support music/);
  assert.throws(() => resolveProvider("sfx", "beatoven"), /beatoven does not support sfx/);
});
