import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Env = Record<string, string | undefined>;

export interface AssetStorageConfig {
  bucket: string;
  region: string;
  endpoint: string | null;
  prefix: string;
  publicBaseUrl: string | null;
  forcePathStyle: boolean;
}

export interface StoredAssetObject {
  storageKey: string;
  imageUrl: string | null;
  mediaType: string;
  byteSize: number;
}

const DEFAULT_PREFIX = "asset-lab";
const DEFAULT_MEDIA_TYPE = "image/png";
const DEFAULT_EXTENSION = "png";
const CACHE_CONTROL = "private, max-age=31536000, immutable";
const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let cachedClient: S3Client | null = null;
let cachedClientKey = "";

function truthy(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function normalizePrefix(prefix: string | undefined): string {
  const trimmed = prefix?.trim().replace(/^\/+|\/+$/g, "");
  return trimmed || DEFAULT_PREFIX;
}

function envValue(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function assetStorageConfig(env: Env = process.env): AssetStorageConfig | null {
  const bucket = envValue(env, "ASSET_STORAGE_BUCKET");
  if (!bucket) return null;

  const endpoint = envValue(env, "ASSET_STORAGE_ENDPOINT");
  const region =
    envValue(env, "ASSET_STORAGE_REGION") ??
    envValue(env, "AWS_REGION") ??
    envValue(env, "AWS_DEFAULT_REGION") ??
    "us-east-1";
  const explicitPathStyle = truthy(env.ASSET_STORAGE_FORCE_PATH_STYLE);

  return {
    bucket,
    region,
    endpoint,
    prefix: normalizePrefix(env.ASSET_STORAGE_PREFIX),
    publicBaseUrl:
      envValue(env, "ASSET_STORAGE_PUBLIC_BASE_URL") ?? envValue(env, "ASSET_BASE_URL"),
    forcePathStyle: explicitPathStyle ?? Boolean(endpoint),
  };
}

export function assetObjectKey(id: string, prefix = DEFAULT_PREFIX, extension = DEFAULT_EXTENSION): string {
  return `${normalizePrefix(prefix)}/${id}.${extension.replace(/^\./, "")}`;
}

export function assetExtension(mediaType: string): string {
  return EXTENSION_BY_MEDIA_TYPE[mediaType] ?? DEFAULT_EXTENSION;
}

export function publicAssetUrl(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/g, "");
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encodedKey}`;
}

function s3Client(config: AssetStorageConfig): S3Client {
  const key = JSON.stringify({
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  });
  if (cachedClient && cachedClientKey === key) return cachedClient;

  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.forcePathStyle,
  });
  cachedClientKey = key;
  return cachedClient;
}

export async function storeAssetImage(
  id: string,
  image: Buffer,
  mediaType = DEFAULT_MEDIA_TYPE,
): Promise<StoredAssetObject | null> {
  const config = assetStorageConfig();
  if (!config) return null;

  const storageKey = assetObjectKey(id, config.prefix, assetExtension(mediaType));
  await s3Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
      Body: new Uint8Array(image),
      ContentType: mediaType,
      CacheControl: CACHE_CONTROL,
    }),
  );

  return {
    storageKey,
    imageUrl: config.publicBaseUrl ? publicAssetUrl(config.publicBaseUrl, storageKey) : null,
    mediaType,
    byteSize: image.byteLength,
  };
}

export async function readAssetObject(storageKey: string): Promise<Buffer | null> {
  const config = assetStorageConfig();
  if (!config) return null;

  try {
    const result = await s3Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
      }),
    );
    if (!result.Body) return null;
    return bodyToBuffer(result.Body);
  } catch (error) {
    const maybe = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (maybe.name === "NoSuchKey" || maybe.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function deleteAssetObject(storageKey: string): Promise<void> {
  const config = assetStorageConfig();
  if (!config) return;
  await s3Client(config).send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }),
  );
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  const maybeWebBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeWebBody.transformToByteArray === "function") {
    return Buffer.from(await maybeWebBody.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
