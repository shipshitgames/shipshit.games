function localFileUrl(id: string): string {
  return `/api/assets/file/${id}`;
}

export function assetUrlForApp(asset: { id: string; url?: string | null }): string {
  if (!asset.url) return localFileUrl(asset.id);
  if (asset.url === `/v1/assets/${asset.id}/file`) return localFileUrl(asset.id);
  return asset.url;
}

/** Preserve CDN-backed URLs and proxy only legacy API file URLs through apps/app. */
export function withLocalAssetUrls<T extends { id: string; url?: string | null }>(
  assets: T[],
): (T & { url: string })[] {
  return assets.map((asset) => ({ ...asset, url: assetUrlForApp(asset) }));
}
