import assert from "node:assert/strict";
import { test } from "node:test";

import { assetUrlForApp, withLocalAssetUrls } from "./asset-urls";

const id = "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2";

test("assetUrlForApp proxies missing and legacy API file URLs", () => {
  assert.equal(assetUrlForApp({ id }), `/api/assets/file/${id}`);
  assert.equal(assetUrlForApp({ id, url: `/v1/assets/${id}/file` }), `/api/assets/file/${id}`);
});

test("assetUrlForApp preserves CDN-backed URLs", () => {
  const cdn = `https://assets.shipshit.games/asset-lab/${id}.png`;
  assert.equal(assetUrlForApp({ id, url: cdn }), cdn);
});

test("withLocalAssetUrls keeps metadata and normalizes url", () => {
  assert.deepEqual(withLocalAssetUrls([{ id, subject: "ripper", url: null }]), [
    { id, subject: "ripper", url: `/api/assets/file/${id}` },
  ]);
});
