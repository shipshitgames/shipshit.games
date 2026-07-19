import type { SpritePromptInput } from "./asset-prompt";
import type { AssetRecord, NewAsset } from "./assets";

const MODEL = "google/nano-banana-2";
const MAX_BATCH = 4;

interface AuthenticatedUser {
  userId: string;
}

interface GameOption {
  slug: string;
  title: string;
}

interface GeneratedAsset {
  data: Buffer;
}

interface AssetCountQuery {
  where: {
    ownerId: string;
    parentId: null;
    createdAt: { gte: Date };
  };
}

export interface AssetGenerateDeps {
  requireAuth: (request: Request) => Promise<AuthenticatedUser | Response>;
  games: readonly GameOption[];
  countAssets: (query: AssetCountQuery) => Promise<number>;
  resolveReplicateKey: () => string | undefined;
  missingReplicateKeyMessage: () => Error;
  readAssetImage: (id: string, ownerId: string) => Promise<Buffer | null>;
  uploadReplicateFile: (
    image: Buffer,
    deps: { resolveKey: () => string },
  ) => Promise<string>;
  sheetPoses: readonly string[];
  aspectRatioFor: (sheetPoses?: readonly string[]) => string;
  spritePrompt: (input: SpritePromptInput) => string;
  generateReplicateAsset: (
    prompt: string,
    options: {
      model: string;
      input: Readonly<Record<string, unknown>>;
      timeoutMs: number;
      pollIntervalMs: number;
    },
    deps: { resolveKey: () => string },
  ) => Promise<GeneratedAsset>;
  saveAsset: (asset: NewAsset, image: Buffer) => Promise<AssetRecord>;
  assetUrl: (record: Pick<AssetRecord, "id">) => string;
  hourlyLimit?: number;
}

export async function handleAssetGenerate(
  request: Request,
  deps: AssetGenerateDeps,
): Promise<Response> {
  const auth = await deps.requireAuth(request);
  if (auth instanceof Response) return auth;

  const { prompt, description, gameSlug, pose, count, sourceId, sheet } = await request
    .json()
    .catch(() => ({}) as Record<string, unknown>);
  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const game = deps.games.find((candidate) => candidate.slug === gameSlug);
  if (!game) {
    return Response.json({ error: `unknown game: ${gameSlug}` }, { status: 400 });
  }
  const batch = Math.min(Math.max(Number(count) || 1, 1), MAX_BATCH);
  // Each render is paid Replicate spend; DB counting keeps this limit shared
  // across serverless instances.
  const hourlyLimit = deps.hourlyLimit ?? (Number(process.env.GENERATE_HOURLY_LIMIT) || 30);

  const recentCount = await deps.countAssets({
    where: {
      ownerId: auth.userId,
      parentId: null,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentCount + batch > hourlyLimit) {
    return Response.json(
      { error: `generation limit reached (${hourlyLimit}/hour)` },
      { status: 429 },
    );
  }

  const token = deps.resolveReplicateKey();
  if (!token) {
    return Response.json({ error: deps.missingReplicateKeyMessage().message }, { status: 503 });
  }

  let referenceUrl: string | undefined;
  if (sourceId) {
    const source = await deps.readAssetImage(String(sourceId), auth.userId);
    if (!source) {
      return Response.json(
        { error: `source asset not found: ${sourceId}` },
        { status: 404 },
      );
    }
    try {
      referenceUrl = await deps.uploadReplicateFile(source, { resolveKey: () => token });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "upload failed" },
        { status: 502 },
      );
    }
  }

  const sheetPoses = sheet ? [...deps.sheetPoses] : undefined;
  const fullPrompt = deps.spritePrompt({
    subject: prompt,
    description: typeof description === "string" ? description : undefined,
    gameSlug: game.slug,
    pose: typeof pose === "string" ? pose : undefined,
    sheetPoses,
    fromReference: Boolean(referenceUrl),
  });
  const input: Record<string, unknown> = {
    aspect_ratio: deps.aspectRatioFor(sheetPoses),
  };
  if (referenceUrl) input.image_input = [referenceUrl];

  const results = await Promise.allSettled(
    Array.from({ length: batch }, () =>
      deps.generateReplicateAsset(
        fullPrompt,
        {
          model: MODEL,
          input,
          timeoutMs: 280_000,
          pollIntervalMs: 1_500,
        },
        { resolveKey: () => token },
      ),
    ),
  );

  const saved = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      continue;
    }
    try {
      const record = await deps.saveAsset(
        {
          subject: prompt,
          description:
            typeof description === "string" && description.trim() ? description.trim() : null,
          fullPrompt,
          style: "art bible",
          pose: sheetPoses ? null : typeof pose === "string" ? pose : null,
          sheetPoses: sheetPoses ?? [],
          gameSlug: game.slug,
          game: game.title,
          model: MODEL,
          ownerId: auth.userId,
        },
        result.value.data,
      );
      saved.push({ ...record, url: deps.assetUrl(record) });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "asset save failed");
    }
  }

  if (saved.length === 0) {
    return Response.json({ error: errors[0] ?? "generation failed" }, { status: 502 });
  }
  return Response.json({ assets: saved, errors });
}
