import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

interface FalStubRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

interface FalStub {
  base: string;
  requests: FalStubRequest[];
  stop: () => void;
}

// Offline fal.run stand-in: the FLUX endpoints answer with a one-image payload
// pointing back at this server, which serves a sharp-built PNG. Mid-gray fill
// keeps the sprite path's edge-background keying from erasing the subject.
async function startFalStub(): Promise<FalStub> {
  // Copy into a plain Uint8Array — sharp's Buffer<ArrayBufferLike> is not a BodyInit.
  const png = new Uint8Array(
    await sharp({
      create: { width: 96, height: 96, channels: 4, background: { r: 122, g: 104, b: 96, alpha: 1 } },
    })
      .png()
      .toBuffer(),
  );
  const requests: FalStubRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/output.png") {
        return new Response(png, { headers: { "content-type": "image/png" } });
      }
      if (req.method === "POST" && (url.pathname === "/fal-ai/flux/dev" || url.pathname === "/fal-ai/flux/schnell")) {
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          headers[key] = value;
        });
        requests.push({ method: req.method, path: url.pathname, headers, body: await req.json() });
        return new Response(
          JSON.stringify({ images: [{ url: `${url.origin}/output.png`, content_type: "image/png" }] }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(`unexpected ${req.method} ${url.pathname}`, { status: 404 });
    },
  });
  return { base: `http://127.0.0.1:${server.port}`, requests, stop: () => server.stop(true) };
}

async function runCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", "generate", ...args], {
    cwd: pkgDir,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function assertWebp(data: Buffer, label: string): void {
  assert.equal(data.subarray(0, 4).toString("ascii"), "RIFF", `${label} missing RIFF magic`);
  assert.equal(data.subarray(8, 12).toString("ascii"), "WEBP", `${label} missing WEBP magic`);
}

test("e2e: fal texture generation registers a webp via the per-kind default model", async () => {
  const stub = await startFalStub();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-fal-e2e-texture-"));
  try {
    const result = await runCli(
      [
        "--id", "e2e-fal-texture",
        "--prompt", "rusted bone plating",
        "--kind", "texture",
        "--provider", "fal",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "512",
      ],
      { FAL_KEY: "e2e-key", FAL_API_BASE_URL: stub.base },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/textures/e2e-fal-texture.webp");
    assert.equal(existsSync(assetPath), true);
    assertWebp(await readFile(assetPath), "texture output");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.id, "e2e-fal-texture");
    assert.equal(entry.kind, "texture");
    assert.equal(entry.game, "shared");
    assert.equal(entry.path, "textures/e2e-fal-texture.webp");
    // The manifest records the raw prompt; the provider gets the styled one.
    assert.equal(entry.prompt, "rusted bone plating");
    assert.equal(entry.provider, "fal");
    assert.equal(entry.license.tool, "fal");
    assert.equal(entry.license.plan, "fal-ai/flux/dev");
    assert.equal(entry.license.kind, "texture");

    assert.equal(stub.requests.length, 1);
    const request = stub.requests[0]!;
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/fal-ai/flux/dev");
    assert.equal(request.headers.authorization, "Key e2e-key");
    assert.equal(request.body.num_images, 1);
    assert.deepEqual(request.body.image_size, { width: 512, height: 512 });
    assert.match(request.body.prompt, /^rusted bone plating\./);
  } finally {
    stub.stop();
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: fal sprite generation honors an explicit schnell model", async () => {
  const stub = await startFalStub();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-fal-e2e-sprite-"));
  try {
    const result = await runCli(
      [
        "--id", "e2e-fal-sprite",
        "--prompt", "a rusted warden husk",
        "--kind", "sprite",
        "--provider", "fal",
        "--model", "fal-ai/flux/schnell",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "512",
      ],
      { FAL_KEY: "e2e-key", FAL_API_BASE_URL: stub.base },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/sprites/e2e-fal-sprite.webp");
    assert.equal(existsSync(assetPath), true);
    assertWebp(await readFile(assetPath), "sprite sheet");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    const entry = manifest.assets[0];
    assert.equal(entry.id, "e2e-fal-sprite");
    assert.equal(entry.kind, "sprite");
    assert.equal(entry.provider, "fal");
    assert.equal(entry.model, "fal-ai/flux/schnell");
    assert.equal(entry.license.plan, "fal-ai/flux/schnell");

    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0]!.path, "/fal-ai/flux/schnell");
  } finally {
    stub.stop();
    await rm(repo, { recursive: true, force: true });
  }
});
