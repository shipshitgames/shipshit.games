// Replicate provider: token discovery, reference upload, prediction lifecycle.
import { execFileSync } from "node:child_process";

export const MODEL = "google/nano-banana-2";

export function getReplicateToken(): string | undefined {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  // Local-dev fallback: the studio keychain entry used by assetgen.
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", "shipshit", "-s", "shipshit-replicate", "-w"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return undefined;
  }
}

function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.find((o) => typeof o === "string");
  return undefined;
}

/** Upload a stored PNG to Replicate's Files API so it can be used as image_input. */
export async function uploadReference(token: string, image: Buffer): Promise<string> {
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(image)], { type: "image/png" }), "reference.png");
  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Replicate file upload ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  const url = json.urls?.get;
  if (!url) throw new Error("Replicate file upload returned no URL");
  return url;
}

export async function runPrediction(
  token: string,
  prompt: string,
  aspectRatio: string,
  referenceUrl?: string,
): Promise<string> {
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio };
  if (referenceUrl) input.image_input = [referenceUrl];
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "wait=60",
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${await res.text()}`);

  let prediction: any = await res.json();
  const started = Date.now();
  const done = new Set(["succeeded", "failed", "canceled"]);
  while (prediction?.status && !done.has(prediction.status)) {
    if (Date.now() - started > 280_000) throw new Error("Replicate timed out");
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(prediction.urls?.get ?? prediction.urls?.self, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!poll.ok) throw new Error(`Replicate poll ${poll.status}`);
    prediction = await poll.json();
  }
  if (prediction?.status !== "succeeded") {
    throw new Error(`Prediction ${prediction?.status ?? "failed"}: ${prediction?.error ?? "unknown"}`);
  }
  const url = outputUrl(prediction.output);
  if (!url) throw new Error("No output image URL");
  return url;
}
