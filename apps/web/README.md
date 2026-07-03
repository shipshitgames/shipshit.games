# shipshit.games web

`apps/web` reads committed content snapshots from `apps/web/content`. Local
content refreshes still read the sibling Deadrot checkout:

```bash
bun run sync:content
```

## Shared Asset Origin

Generated Deadrot assets stay source-of-truth in `../deadrotcom/packages/assets`.
The web snapshot records package-relative `sourcePath` values and resolves them
through the shared asset origin when configured:

```bash
NEXT_PUBLIC_ASSET_BASE_URL=https://<cdn-origin>/assets
ASSET_BASE_URL=https://<cdn-origin>/assets
```

`NEXT_PUBLIC_ASSET_BASE_URL` is used by the deployed Next app. `ASSET_BASE_URL`
is useful for scripts and non-public server-only checks. If neither is set, the
site uses committed `public/` sprite copies. `bun run check:content` fails when a
snapshot asset has neither a local public copy nor a resolvable CDN URL.

To refresh from the local package while writing CDN-backed URLs into new
snapshots:

```bash
bun apps/web/scripts/sync-content.ts --asset-base-url https://<cdn-origin>/assets
```
