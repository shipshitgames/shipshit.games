import { privateContentUrl } from "./content-url";

const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ConfiguredMemberAssetPack = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  privateUrl: string;
};

export type MemberAssetPack = Omit<ConfiguredMemberAssetPack, "privateUrl">;

function requiredString(value: unknown, field: string, maxLength: number) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`Member asset pack ${field} is invalid`);
  }
  return value.trim();
}

function privateUrl(value: unknown) {
  const raw = requiredString(value, "privateUrl", 2_048);
  return privateContentUrl(raw, "Member asset pack privateUrl");
}

function publishedAt(value: unknown) {
  const raw = requiredString(value, "publishedAt", 64);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Member asset pack publishedAt is invalid");
  }
  return date.toISOString();
}

export function parseMemberAssetPacks(
  input = process.env.MEMBER_ASSET_PACKS_JSON,
): ConfiguredMemberAssetPack[] {
  if (!input?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("MEMBER_ASSET_PACKS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw new Error(
      "MEMBER_ASSET_PACKS_JSON must be an array of up to 100 packs",
    );
  }

  const seen = new Set<string>();
  return parsed.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Member asset pack must be an object");
    }
    const record = value as Record<string, unknown>;
    const id = requiredString(record.id, "id", 80);
    if (!PACK_ID.test(id)) {
      throw new Error("Member asset pack id must be a lowercase slug");
    }
    if (seen.has(id)) throw new Error(`Duplicate member asset pack id: ${id}`);
    seen.add(id);

    return {
      id,
      title: requiredString(record.title, "title", 120),
      description: requiredString(record.description, "description", 500),
      publishedAt: publishedAt(record.publishedAt),
      privateUrl: privateUrl(record.privateUrl),
    };
  });
}

export function publishedMemberAssetPacks(
  now = new Date(),
  input = process.env.MEMBER_ASSET_PACKS_JSON,
): MemberAssetPack[] {
  const published: MemberAssetPack[] = [];
  for (const pack of parseMemberAssetPacks(input)) {
    if (new Date(pack.publishedAt) > now) continue;
    const { privateUrl: _privateUrl, ...publicPack } = pack;
    published.push(publicPack);
  }
  return published;
}

export function memberAssetPackDestination(
  packId: string,
  now = new Date(),
  input = process.env.MEMBER_ASSET_PACKS_JSON,
) {
  const pack = parseMemberAssetPacks(input).find(
    (candidate) =>
      candidate.id === packId && new Date(candidate.publishedAt) <= now,
  );
  return pack?.privateUrl ?? null;
}
