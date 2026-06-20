# Repo Boundary

last_verified: 2026-06-19

`shipshitgames` is the studio/tooling repo **and the multi-IP studio umbrella**:
the storefront, identity, and commerce layer for every Ship Shit Games franchise
(Deadrot is the first). See `STUDIO-ARCHITECTURE.md` for the full target.

## Owns

- Studio web/app/desktop product surfaces.
- The **brand / discovery hub + tools & courses store** (`apps/web` /
  shipshit.games): lists every franchise's games and links to them; **sells the
  tooling (Studio Pass) + courses** to the dev/learner audience. It does NOT sell
  or gate individual games — those live on the franchise property.
- The **studio Clerk + Stripe** for the tools/courses audience (devs/learners),
  billed via `apps/api`. Franchises run their OWN player auth/billing; the studio
  does not own player identity.
- Future CLI surfaces for studio tooling, including the **franchise scaffolder**
  (`apps/cli`) that births new IP repos.
- `packages/assetgen` and related reusable asset generation logic.
- The assetgen CLI product, which should ship quickly and be dogfooded against
  Deadrot.
- `packages/engine` / `@shipshitgames/engine`, the canonical org-level game
  engine package for Ship Shit Games IPs.
- **Courses / learning content** via `packages/ressources`.
- Studio-only research, shared utilities, and UI.

## Does Not Own

- Shipped Deadrot games.
- Canonical Deadrot runtime assets.
- Deadrot runtime audio, soundtrack, sprites, textures, fonts, or UI art.
- Deadrot-specific runtime packages imported by shipped Deadrot games.

Those belong in the sibling `../deadrotcom` repo.

## Rule

If it builds/generates/edits assets as tooling, it belongs here. If it ships to
players or is Deadrot-specific runtime data/assets, it belongs in
`../deadrotcom`.

Do not move `packages/assetgen` into `../deadrotcom`; configure it to read/write
`../deadrotcom/packages/assets` instead.

Do not move or rename `@shipshitgames/engine` to `@deadrot/engine`. Deadrot
games should consume the canonical org-level engine from this repo through the
published package for CI/release builds or a temporary local `bun link` bridge
for unpublished engine changes. The workflow and temporary duplicate-package
handling live in `packages/engine/CANONICAL-ENGINE.md`. Do not create a separate
engine repo or board until the engine has an independent release cadence or
multiple active IP consumers that justify the split.

## Multi-IP umbrella (2026-06-19)

Ship Shit Games is a **multi-IP studio**. This repo is the umbrella **brand +
studio + tools/courses store**; each game universe is a **franchise satellite**
in its own sibling repo (Deadrot first, scaffolded by `apps/cli`).

- **Federated identity — franchises keep their own Clerk.** `deadrot.com` owns
  Deadrot players + game gates + game purchases (its Clerk + Stripe) and is
  playable-focused (**no asset generation** there). The studio Clerk serves only
  the tools/courses audience. **Two Clerks is fine; they are NOT bridged.**
- **Kill the bridge by decoupling, not consolidating.** Studio Pass becomes
  tools/courses-only and stops granting games. The cross-property email-matching
  code in `deadrotcom/apps/web/lib/shipshit-entitlement*.ts` is removed (after
  grandfathering existing game-access subscribers). **No user migration.**
- shipshit.games **stops selling/gating individual games**; it lists + links to
  the franchise property. Removes the duplicate storefront.
- **The Studio is the multi-IP build cockpit (the SaaS itself).** Select IP →
  game → full toolchain (generate, lore, play-test). Generation happens ONLY here
  and is pushed to the product. Needs an explicit **project registry** (IP → repo
  path + catalog + assets dir) replacing assetgen's hardcoded `../deadrotcom`
  sibling path in `packages/assetgen/src/commands/paths.ts`.
- Lore is per-franchise (lives in the franchise repo); courses are studio-level
  (`packages/ressources`).

Full target + migration: `STUDIO-ARCHITECTURE.md`. Supersedes the old
`../deadrotcom-restructure-plan.md` (one-monorepo collapse + assetgen move),
which is rejected by these boundaries.
