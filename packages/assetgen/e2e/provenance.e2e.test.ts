import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

async function runCli(
  args: string[],
  env: Record<string, string> = {},
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

interface FalStub {
  base: string;
  seeds: Array<number | undefined>;
  stop: () => void;
}

// Offline fal stand-in that ECHOES the request seed back (plus a request_id),
// exactly as the real FLUX endpoints do, so the CLI can record reproducible:true.
async function startSeedEchoingFalStub(): Promise<FalStub> {
  const png = new Uint8Array(
    await sharp({
      create: { width: 96, height: 96, channels: 4, background: { r: 122, g: 104, b: 96, alpha: 1 } },
    })
      .png()
      .toBuffer(),
  );
  const seeds: Array<number | undefined> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/output.png") {
        return new Response(png, { headers: { "content-type": "image/png" } });
      }
      if (req.method === "POST" && url.pathname.startsWith("/fal-ai/")) {
        const body: any = await req.json();
        seeds.push(body.seed);
        return new Response(
          JSON.stringify({
            images: [{ url: `${url.origin}/output.png`, content_type: "image/png" }],
            seed: body.seed,
            request_id: "req-e2e-1",
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(`unexpected ${req.method} ${url.pathname}`, { status: 404 });
    },
  });
  return { base: `http://127.0.0.1:${server.port}`, seeds, stop: () => server.stop(true) };
}

test("e2e: mock generation records non-reproducible provenance and no human authorship", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-prov-mock-"));
  try {
    const result = await runCli([
      "--id", "prov-husk",
      "--prompt", "a parasite-taken Scourge host",
      "--kind", "sprite",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "128",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.provenance.provider, "mock");
    assert.equal(entry.provenance.model, "mock");
    assert.equal(entry.provenance.reproducible, false);
    assert.equal(entry.provenance.seed, undefined);
    assert.match(entry.provenance.promptHash, /^[0-9a-f]{16}$/);
    assert.match(entry.provenance.styleSuffixHash, /^[0-9a-f]{16}$/);
    assert.match(entry.provenance.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(entry.human, undefined);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: --authored --edit-kind records human authorship on the manifest entry", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-prov-human-"));
  try {
    const result = await runCli([
      "--id", "prov-husk",
      "--prompt", "a parasite-taken Scourge host",
      "--kind", "sprite",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "128",
      "--authored",
      "--edit-kind", "composite",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.deepEqual(manifest.assets[0].human, { authored: true, editKind: "composite" });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: a seeded fal generation records the honored seed as reproducible provenance", async () => {
  const stub = await startSeedEchoingFalStub();
  const repo = await mkdtemp(join(tmpdir(), "assetgen-prov-fal-"));
  try {
    const result = await runCli(
      [
        "--id", "prov-fal-texture",
        "--prompt", "rusted bone plating",
        "--kind", "texture",
        "--provider", "fal",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "512",
        "--seed", "2024",
      ],
      { FAL_KEY: "e2e-key", FAL_API_BASE_URL: stub.base },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    // The seed reached the provider request body.
    assert.deepEqual(stub.seeds, [2024]);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.provenance.provider, "fal");
    assert.equal(entry.provenance.model, "fal-ai/flux/dev");
    assert.equal(entry.provenance.reproducible, true);
    assert.equal(entry.provenance.seed, 2024);
    assert.equal(entry.provenance.requestId, "req-e2e-1");
    assert.match(entry.provenance.promptHash, /^[0-9a-f]{16}$/);
    assert.match(entry.provenance.styleSuffixHash, /^[0-9a-f]{16}$/);
  } finally {
    stub.stop();
    await rm(repo, { recursive: true, force: true });
  }
});
