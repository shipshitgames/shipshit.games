import assert from "node:assert/strict";
import { test } from "node:test";

import { assetExtension, assetObjectKey, assetStorageConfig, publicAssetUrl } from "./asset-storage";

test("assetStorageConfig is disabled until a bucket is configured", () => {
  assert.equal(assetStorageConfig({}), null);
});

test("assetStorageConfig normalizes S3-compatible settings", () => {
  assert.deepEqual(
    assetStorageConfig({
      ASSET_STORAGE_BUCKET: "shipshit-assets",
      ASSET_STORAGE_ENDPOINT: "https://r2.example",
      ASSET_STORAGE_PREFIX: "/generated/asset-lab/",
      ASSET_STORAGE_PUBLIC_BASE_URL: "https://assets.shipshit.games/",
      AWS_REGION: "us-west-1",
    }),
    {
      bucket: "shipshit-assets",
      endpoint: "https://r2.example",
      forcePathStyle: true,
      prefix: "generated/asset-lab",
      publicBaseUrl: "https://assets.shipshit.games/",
      region: "us-west-1",
    },
  );
});

test("assetObjectKey keeps generated images under a clear prefix", () => {
  assert.equal(
    assetObjectKey("3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2", "/asset-lab/"),
    "asset-lab/3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2.png",
  );
});

test("assetExtension preserves the encoded image format", () => {
  assert.equal(assetExtension("image/jpeg"), "jpg");
  assert.equal(assetExtension("image/png"), "png");
  assert.equal(assetExtension("image/webp"), "webp");
});

test("publicAssetUrl preserves key hierarchy and escapes path segments", () => {
  assert.equal(
    publicAssetUrl("https://assets.shipshit.games/", "asset-lab/a sprite.png"),
    "https://assets.shipshit.games/asset-lab/a%20sprite.png",
  );
});
