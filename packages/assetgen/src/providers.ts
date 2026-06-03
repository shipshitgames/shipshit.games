import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const pexec = promisify(execFile);

export type Provider = (prompt: string, opts: { size: string }) => Promise<Buffer>;

/** OpenAI Images (gpt-image-1) — transparent PNG. BYO OPENAI_API_KEY. */
export const openai: Provider = async (prompt, opts) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: opts.size,
      background: "transparent",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return Buffer.from(json.data[0].b64_json, "base64");
};

/** fal.ai (FLUX) — BYO FAL_KEY. */
export const fal: Provider = async (prompt) => {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY not set");
  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt, image_size: "square_hd" }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("fal: no image in response");
  return Buffer.from(await (await fetch(url)).arrayBuffer());
};

/** Local Codex CLI — delegates image generation to the authed `codex` agent. */
export const codex: Provider = async (prompt) => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-"));
  const out = join(dir, "out.png");
  await pexec(
    "codex",
    ["exec", "--full-auto", `Generate one PNG image and save it to ${out} (transparent background). Image: ${prompt}`],
    { timeout: 240_000, maxBuffer: 1024 * 1024 * 32 },
  );
  return readFile(out);
};

/** Offline placeholder for dry-runs / pipeline tests (no network/key). */
export const mock: Provider = async (_p, opts) => {
  const n = parseInt(opts.size, 10) || 256;
  return sharp({
    create: { width: n, height: n, channels: 4, background: { r: 26, g: 20, b: 20, alpha: 1 } },
  })
    .png()
    .toBuffer();
};

export const providers: Record<string, Provider> = { openai, fal, codex, mock };
