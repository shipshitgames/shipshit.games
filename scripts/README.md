# Release & deploy

`release.mjs` publishes the public `@shipshitgames/*` packages, cuts every
consumer's local dep spec over to the published version, opens a PR per repo,
and deploys the Vercel-linked apps + games.

`release-tag.mjs` stamps a **production release marker** — an annotated git tag
on the commit that's live in prod. It is **not** the deployer: production is
deployed by [`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml),
which fires on a published GitHub Release whose tag is semver `v*` (Vercel's
master git auto-deploy is disabled in `vercel.json`). A `prod-*` marker tag is
deploy-neutral — the immutable, auditable record of what shipped, which is the
trunk-based replacement for a long-lived prod branch. By default it creates **no**
GitHub Release, so a marker never trips the workflow's `v*` deploy gate.

## Production release markers (`release:tag`)

```sh
bun run release:tag        # DRY RUN — prints the plan (commit, tag name); creates/pushes nothing (a read-only `git fetch` refreshes origin/master)
bun run release:tag:run    # == bun scripts/release-tag.mjs --execute
```

Flags: `--sha=<commit>` · `--tag=<name>` · `--message=<text>` · `--release`
· `--no-fetch`

What it does:

1. Resolves the commit to mark (default: `origin/master` HEAD; pass `--sha` to
   pin an exact deployed commit).
2. Picks a unique tag name (default `prod-YYYY-MM-DD`, deduped with `.2`, `.3`…).
3. Creates an annotated tag and pushes it.
4. Optionally creates a matching GitHub release — **off by default** (a marker is
   deploy-neutral); pass `--release` to opt in.

Auth for `--execute`: push access (to push the tag), plus `gh auth status` if
you pass `--release`. Run `git push` to a feature branch is **not** required —
the tag points straight at the deployed commit.

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
