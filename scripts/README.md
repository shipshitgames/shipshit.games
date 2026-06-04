# Release & deploy

`release.mjs` publishes the public `@shipshitgames/*` packages, cuts every
consumer's local dep spec over to the published version, opens a PR per repo,
and deploys the Vercel-linked apps + games.

## Usage

```sh
bun run release            # DRY RUN — prints the full plan, touches nothing
bun run release:run        # == bun scripts/release.mjs --execute
```

Flags: `--no-publish` · `--no-pr` · `--no-deploy` · `--bump=patch|minor|major`
· `--only=engine,ui` · `--base=master`

## What it does (in order)

1. **Discover** publishable packages (`packages/*`, `private !== true`), topo-sorted by intra-scope deps.
2. **Publish** each to npm — idempotent: skips any `name@version` already on the registry.
3. **Cut over** every consumer (`apps/*`, `packages/*`, `../games/*`) — rewrites
   `workspace:*` / `*` / `file:` specs of a *published* `@shipshitgames/*` package to `^<version>`.
   Unpublished/private deps keep their local link.
4. **PR** per git repo with changes (`release/cutover-<date>` → default branch).
5. **Deploy** every `.vercel/project.json`-linked target via `npx vercel deploy --prod`.

## Auth required for `--execute`

- `npm login` (publish) — **not** logged in by default
- `gh auth status` (PRs)
- Vercel login or `VERCEL_TOKEN` (deploy)

## ⚠️ Current state (2026-06-04)

`@shipshitgames/engine@0.1.0` was published with a **corrupted barrel** (empty
`index.ts` exports) — consuming it gives an empty module. The package is now
bumped to **`0.1.1`** locally; the next `release:run` republishes the correct
barrel and cuts consumers over to `^0.1.1`. `@shipshitgames/ui@0.1.0` is fine.

## Local engine DX

Games resolve `@shipshitgames/engine` from npm in CI. Locally, `vite.config.ts`
**gates a live alias on `fs.existsSync`** of the monorepo source — so when the
`shipshitgames/` repo sits beside the game, edits to the engine hot-reload with
no `bun link` needed; in CI that path is absent and resolution falls back to the
published package. `tsc` always resolves from `node_modules` (no committed path),
so a fresh `bun install` refreshes the engine types after an engine change.
