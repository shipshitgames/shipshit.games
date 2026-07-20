import { expect, mock, test } from "bun:test";
import { Prisma } from "@/generated/client";

const findMany = mock(async (_query: unknown): Promise<unknown[]> => []);
const findFirst = mock(
  async (_query: unknown): Promise<unknown | null> => null,
);
const findUnique = mock(
  async (_query: unknown): Promise<unknown | null> => null,
);
const create = mock(async (_query: unknown): Promise<unknown> => null);

mock.module("./db", () => ({
  db: {
    asset: { create, findFirst, findMany, findUnique },
  },
}));

const {
  assetUrl,
  AssetArchiveTooLargeError,
  listAssetSlices,
  listAssets,
  readAssetFile,
  readAssetFiles,
  readAssetImage,
  readAssetWithImage,
  saveAsset,
} = await import("./assets");

const ASSET_ID = "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2";
const OWNER_ID = "user_a";

function latestQuery(
  fn: typeof findMany | typeof findFirst | typeof create,
): Record<string, unknown> {
  return fn.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

test("asset read helpers scope every Prisma query to the owner", async () => {
  await listAssets(OWNER_ID);
  expect(latestQuery(findMany).where).toEqual({ ownerId: OWNER_ID });

  await readAssetImage(ASSET_ID, OWNER_ID);
  expect(latestQuery(findFirst).where).toEqual({
    id: ASSET_ID,
    ownerId: OWNER_ID,
  });

  await readAssetFile(ASSET_ID, OWNER_ID);
  expect(latestQuery(findFirst).where).toEqual({
    id: ASSET_ID,
    ownerId: OWNER_ID,
  });

  await readAssetWithImage(ASSET_ID, OWNER_ID);
  expect(latestQuery(findFirst).where).toEqual({
    id: ASSET_ID,
    ownerId: OWNER_ID,
  });

  await listAssetSlices(ASSET_ID, OWNER_ID);
  expect(latestQuery(findMany).where).toEqual({
    parentId: ASSET_ID,
    ownerId: OWNER_ID,
  });

  await readAssetFiles([ASSET_ID], OWNER_ID);
  expect(latestQuery(findMany).where).toEqual({
    id: { in: [ASSET_ID] },
    ownerId: OWNER_ID,
  });
});

test("asset helpers fail closed when the owner is missing", async () => {
  await expect(listAssets("")).rejects.toThrow("ownerId is required");
  await expect(readAssetFile(ASSET_ID, "")).rejects.toThrow(
    "ownerId is required",
  );
  await expect(readAssetFiles([ASSET_ID], "")).rejects.toThrow(
    "ownerId is required",
  );
});

test("readAssetFiles rejects oversized archives before loading image bodies", async () => {
  findMany.mockImplementationOnce(async () => [{ id: ASSET_ID, byteSize: 11 }]);
  await expect(readAssetFiles([ASSET_ID], OWNER_ID, 10)).rejects.toBeInstanceOf(
    AssetArchiveTooLargeError,
  );
});

test("readAssetFiles enforces the limit against loaded bytes when metadata is absent", async () => {
  findMany.mockImplementationOnce(async () => [
    {
      id: ASSET_ID,
      byteSize: null,
      image: new Uint8Array([1, 2, 3, 4]),
      storageKey: null,
      imageUrl: null,
    },
  ]);
  await expect(readAssetFiles([ASSET_ID], OWNER_ID, 3)).rejects.toBeInstanceOf(
    AssetArchiveTooLargeError,
  );
});

test("readAssetFile proxies legacy image URLs instead of disclosing a redirect", async () => {
  findFirst.mockImplementationOnce(async () => ({
    image: null,
    storageKey: null,
    imageUrl: "https://assets.example.test/legacy.png",
    mediaType: "image/png",
  }));
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(async () => new Response(new Uint8Array([1, 2, 3])));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    const file = await readAssetFile(ASSET_ID, OWNER_ID);
    expect(file).toEqual({
      kind: "bytes",
      data: Buffer.from([1, 2, 3]),
      mediaType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("asset URLs stay behind the authenticated file proxy", () => {
  expect(assetUrl({ id: ASSET_ID })).toBe(`/v1/assets/${ASSET_ID}/file`);
});

test("saveAsset persists the detected media type instead of assuming PNG", async () => {
  const oldBucket = process.env.ASSET_STORAGE_BUCKET;
  delete process.env.ASSET_STORAGE_BUCKET;

  create.mockImplementationOnce(async (query: unknown) => {
    const data = (query as { data: Record<string, unknown> }).data;
    return {
      ...data,
      createdAt: new Date("2026-07-09T00:00:00.000Z"),
    };
  });

  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    const record = await saveAsset(
      {
        subject: "Warden",
        description: null,
        fullPrompt: "Warden portrait",
        style: null,
        pose: null,
        sheetPoses: [],
        gameSlug: "zero-day",
        game: "Zero Day",
        model: "test-model",
        ownerId: OWNER_ID,
      },
      jpeg,
    );

    expect(
      (latestQuery(create).data as Record<string, unknown>).mediaType,
    ).toBe("image/jpeg");
    expect(record.mediaType).toBe("image/jpeg");
  } finally {
    if (oldBucket === undefined) delete process.env.ASSET_STORAGE_BUCKET;
    else process.env.ASSET_STORAGE_BUCKET = oldBucket;
  }
});

test("saveAsset reuses an existing job output instead of writing duplicate bytes", async () => {
  findUnique.mockImplementationOnce(async () => ({
    id: ASSET_ID,
    subject: "Warden",
    description: null,
    fullPrompt: "Warden portrait",
    style: null,
    pose: null,
    sheetPoses: [],
    gameSlug: "zero-day",
    game: "Zero Day",
    model: "test-model",
    storageKey: "asset-lab/existing.png",
    mediaType: "image/png",
    byteSize: 4,
    ownerId: OWNER_ID,
    generationJobId: "job-1",
    generationBatchIndex: 0,
    parentId: null,
    sliceIndex: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
  }));
  const storeImage = mock(async () => {
    throw new Error("must not upload an existing output");
  });

  const record = await saveAsset(
    {
      subject: "Warden",
      description: null,
      fullPrompt: "Warden portrait",
      style: null,
      pose: null,
      sheetPoses: [],
      gameSlug: "zero-day",
      game: "Zero Day",
      model: "test-model",
      ownerId: OWNER_ID,
      generationJobId: "job-1",
      generationBatchIndex: 0,
    },
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    { storeImage },
  );

  expect(record.id).toBe(ASSET_ID);
  expect(storeImage).not.toHaveBeenCalled();
});

test("saveAsset resolves a concurrent generation-output insert without undercounting", async () => {
  const concurrentRow = {
    id: ASSET_ID,
    subject: "Warden",
    description: null,
    fullPrompt: "Warden portrait",
    style: null,
    pose: null,
    sheetPoses: [],
    gameSlug: "zero-day",
    game: "Zero Day",
    model: "test-model",
    storageKey: "asset-lab/winner.png",
    mediaType: "image/png",
    byteSize: 4,
    ownerId: OWNER_ID,
    generationJobId: "job-1",
    generationBatchIndex: 0,
    parentId: null,
    sliceIndex: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
  };
  findUnique
    .mockImplementationOnce(async () => null)
    .mockImplementationOnce(async () => concurrentRow);
  create.mockImplementationOnce(async () => {
    throw new Prisma.PrismaClientKnownRequestError("unique constraint", {
      code: "P2002",
      clientVersion: "6.19.0",
    });
  });
  const deleteObject = mock(async () => {});

  const record = await saveAsset(
    {
      subject: "Warden",
      description: null,
      fullPrompt: "Warden portrait",
      style: null,
      pose: null,
      sheetPoses: [],
      gameSlug: "zero-day",
      game: "Zero Day",
      model: "test-model",
      ownerId: OWNER_ID,
      generationJobId: "job-1",
      generationBatchIndex: 0,
    },
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    {
      storeImage: async () => ({
        storageKey: "asset-lab/loser.png",
        imageUrl: "https://assets.example.test/loser.png",
        mediaType: "image/png",
        byteSize: 4,
      }),
      deleteObject,
    },
  );

  expect(record.id).toBe(ASSET_ID);
  expect(deleteObject).toHaveBeenCalledWith("asset-lab/loser.png");
});

test("saveAsset deletes an uploaded object when the metadata write fails", async () => {
  const metadataError = new Error("database unavailable");
  create.mockImplementationOnce(async () => {
    throw metadataError;
  });
  const deleteObject = mock(async (_key: string) => {});

  await expect(
    saveAsset(
      {
        subject: "Warden",
        description: null,
        fullPrompt: "Warden portrait",
        style: null,
        pose: null,
        sheetPoses: [],
        gameSlug: "zero-day",
        game: "Zero Day",
        model: "test-model",
        ownerId: OWNER_ID,
      },
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      {
        storeImage: async () => ({
          storageKey: "asset-lab/generated.png",
          imageUrl: "https://assets.example.test/generated.png",
          mediaType: "image/png",
          byteSize: 4,
        }),
        deleteObject,
      },
    ),
  ).rejects.toBe(metadataError);
  expect(deleteObject).toHaveBeenCalledWith("asset-lab/generated.png");
});
