import {
  generateReplicateAsset,
  missingReplicateKeyMessage,
  resolveReplicateKey,
  uploadReplicateFile,
} from "@shipshitgames/assetgen/replicate";
import { GAMES } from "@shipshitgames/shared";
import { requireAuth } from "@/lib/auth";
import { handleAssetGenerate } from "@/lib/asset-generate";
import { assetUrl, readAssetImage, saveAsset } from "@/lib/assets";
import { aspectRatioFor, SHEET_POSES, spritePrompt } from "@/lib/asset-prompt";
import { db } from "@/lib/db";

export const runtime = "nodejs";
// Generation polls Replicate for minutes per image.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  return handleAssetGenerate(request, {
    requireAuth,
    games: GAMES,
    countAssets: (query) => db.asset.count(query),
    resolveReplicateKey,
    missingReplicateKeyMessage,
    readAssetImage,
    uploadReplicateFile,
    sheetPoses: SHEET_POSES,
    aspectRatioFor,
    spritePrompt,
    generateReplicateAsset,
    saveAsset,
    assetUrl,
  });
}
