import { beforeEach, expect, mock, test } from "bun:test";
import { handleAssetGenerate, type AssetGenerateDeps } from "./asset-generate";

const count = mock(async () => 0);
const readAssetImage = mock(async () => null as Buffer | null);
const saveAsset = mock(async (_asset: Parameters<AssetGenerateDeps["saveAsset"]>[0], _image: Buffer) => ({
  id: "asset-1",
  subject: "Warden",
  description: null,
  fullPrompt: "generated prompt",
  style: "art bible",
  pose: null,
  sheetPoses: null,
  gameSlug: "scourge-survivors",
  game: "Scourge Survivors",
  model: "google/nano-banana-2",
  storageKey: null,
  mediaType: "image/png",
  byteSize: 4,
  ownerId: "user-1",
  parentId: null,
  sourceId: null,
  editInstruction: null,
  sliceIndex: null,
  createdAt: "2026-07-16T00:00:00.000Z",
}));
const uploadReplicateFile = mock(async (_image: Buffer, _deps?: unknown) => "https://files.replicate.com/reference.png");
const generateReplicateAsset = mock(async (_prompt: string, _opts: unknown, _deps?: unknown) => ({
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  mediaType: "image/png",
  extension: "png",
  model: "google/nano-banana-2",
}));
const buildSpritePrompt = mock(({ subject }: { subject: string }) => `sprite: ${subject}`);

let replicateKey: string | undefined = "unit-key";

const deps: AssetGenerateDeps = {
  requireAuth: async () => ({ userId: "user-1" }),
  games: [{ slug: "scourge-survivors", title: "Scourge Survivors" }],
  countAssets: count,
  resolveReplicateKey: () => replicateKey,
  missingReplicateKeyMessage: () =>
    new Error(
      "No Replicate key. Set REPLICATE_API_TOKEN, or store it the shipcode way:\n" +
        "  security add-generic-password -a shipshit -s shipshit-replicate -w <KEY>",
    ),
  readAssetImage,
  uploadReplicateFile,
  sheetPoses: ["idle", "attacking", "running", "jumping"],
  aspectRatioFor: (sheetPoses) => (sheetPoses?.length ? "21:9" : "1:1"),
  spritePrompt: buildSpritePrompt,
  generateReplicateAsset,
  saveAsset,
  assetUrl: ({ id }) => `/v1/assets/${id}/file`,
};

beforeEach(() => {
  replicateKey = "unit-key";
  count.mockClear();
  readAssetImage.mockClear();
  saveAsset.mockClear();
  uploadReplicateFile.mockClear();
  generateReplicateAsset.mockClear();
  buildSpritePrompt.mockClear();
  count.mockImplementation(async () => 0);
  readAssetImage.mockImplementation(async () => null);
  uploadReplicateFile.mockImplementation(async () => "https://files.replicate.com/reference.png");
  generateReplicateAsset.mockImplementation(async () => ({
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mediaType: "image/png",
    extension: "png",
    model: "google/nano-banana-2",
  }));
  buildSpritePrompt.mockImplementation(({ subject }) => `sprite: ${subject}`);
});

async function post(body: Record<string, unknown>): Promise<Response> {
  return handleAssetGenerate(
    new Request("https://api.shipshit.games/v1/assets/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    deps,
  );
}

test("generate route preserves validation and provider error statuses", async () => {
  let response = await post({ gameSlug: "scourge-survivors" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "prompt is required" });

  response = await post({ prompt: "Warden", gameSlug: "unknown-game" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "unknown game: unknown-game" });

  replicateKey = undefined;
  response = await post({ prompt: "Warden", gameSlug: "scourge-survivors" });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("No Replicate key.");

  replicateKey = "unit-key";
  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
  });
  expect(response.status).toBe(404);
  expect((await response.json()).error).toContain("source asset not found");

  readAssetImage.mockImplementationOnce(async () => Buffer.from([1]));
  uploadReplicateFile.mockImplementationOnce(async () => {
    throw new Error("upload unavailable");
  });
  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
  });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "upload unavailable" });

  generateReplicateAsset.mockImplementationOnce(async () => {
    throw new Error("prediction failed");
  });
  response = await post({ prompt: "Warden", gameSlug: "scourge-survivors" });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "prediction failed" });
});

test("generate route passes Replicate inputs and saves downloaded bytes", async () => {
  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sheet: true,
    count: 2,
  });

  expect(response.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(2);
  expect(generateReplicateAsset.mock.calls[0]?.[1]).toMatchObject({
    model: "google/nano-banana-2",
    input: { aspect_ratio: "21:9" },
  });
  expect(saveAsset).toHaveBeenCalledTimes(2);
  expect(saveAsset.mock.calls[0]?.[1]).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

test("generate route forwards the uploaded reference URL as image_input", async () => {
  readAssetImage.mockImplementationOnce(async () => Buffer.from([1, 2, 3]));

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
  });

  expect(response.status).toBe(200);
  expect(uploadReplicateFile).toHaveBeenCalledTimes(1);
  expect(generateReplicateAsset.mock.calls[0]?.[1]).toMatchObject({
    input: {
      aspect_ratio: "1:1",
      image_input: ["https://files.replicate.com/reference.png"],
    },
  });
});

test("generate route validates edit requests before provider spend", async () => {
  let response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    editInstruction: "add shoulder armor",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "sourceId is required when editInstruction is set",
  });

  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
    editInstruction: " ",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "editInstruction must not be empty" });
  expect(readAssetImage).not.toHaveBeenCalled();
  expect(generateReplicateAsset).not.toHaveBeenCalled();
});

test("generate route preserves edit lineage and supports edit batches", async () => {
  readAssetImage.mockImplementationOnce(async () => Buffer.from([1, 2, 3]));

  const response = await post({
    prompt: "Warden",
    description: "bone armor",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
    editInstruction: "  add a glowing toxic core  ",
    count: 3,
  });

  expect(response.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(3);
  expect(buildSpritePrompt).toHaveBeenCalledWith(
    expect.objectContaining({
      fromReference: true,
      editInstruction: "add a glowing toxic core",
    }),
  );
  expect(saveAsset).toHaveBeenCalledTimes(3);
  for (const call of saveAsset.mock.calls) {
    expect(call[0]).toMatchObject({
      sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
      editInstruction: "add a glowing toxic core",
    });
  }
});
