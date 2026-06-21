# Ship Shit Games — Studio Umbrella Architecture

last_verified: 2026-06-19
status: active — **supersedes** `../deadrotcom-restructure-plan.md`

Canonical target architecture for Ship Shit Games as a **multi-IP studio**.
Replaces the old "collapse everything into one monorepo + move assetgen into
deadrot" plan, which contradicted decisions locked in
`.agents/memory/repo-boundary.md`.

---

## Context

Two sibling repos, GitHub org `shipshitgames`:

- **`shipshitgames`** (`shipshit.games`) — the studio: generator
  (`packages/assetgen`), engine, Electron Studio, CLI scaffolder, learning
  library (`packages/ressources`), plus the brand hub + members portal + API.
- **`deadrotcom`** (`deadrot.com`) — the Deadrot franchise: 8 games
  (`apps/games/*`, a connected universe with cross-game progression via
  Warline), the lore vault (`apps/lore`), the shipped renders
  (`packages/assets`), **its own Clerk + Stripe + game paywall**.

The asset pipeline is already correct: `assetgen` lives in the studio, finds
`../deadrotcom/packages/assets` by sibling path, writes renders there. **Do not
move it.** Generating with raw `gpt-image-2` from inside the deadrot repo
bypasses this tool — run `assetgen` from the studio instead.

**The real mess is not "two Clerks" — it's that the two Clerks are *bridged*.**
Today a studio-side **Studio Pass** ($4.99/mo) grants deadrot-side **Deadrot
Collection** access via fragile verified-email matching across a shared Stripe
account (`deadrotcom/apps/web/lib/shipshit-entitlement*.ts`). That bridge, plus a
**duplicate game storefront** on shipshit.games, is the mess.

## Locked decisions (2026-06-19)

- **D1 — Multi-IP gaming SaaS.** `shipshit.games` is the umbrella **brand +
  studio**, the **gaming SaaS** where the tools are sold, **and the build
  cockpit**. Each game universe is a **franchise satellite / product** (Deadrot
  first, dogfooded), scaffolded by `apps/cli`.
- **D2 — Three revenue lines, by audience:**
  **games** → sold + gated **on the franchise property** (deadrot.com), to
  players. **tools** (Studio Pass) and **courses** → sold on shipshit.games, to
  devs/learners.
- **D3 — Federated identity. deadrot keeps its own Clerk.** It owns Deadrot
  player accounts and the game gates. The studio keeps its own Clerk for the
  tools/courses audience. **Two Clerks is fine; they are NOT bridged.**
- **D4 — Kill the bridge by decoupling, not consolidating.** Studio Pass becomes
  **tools/courses-only** and stops granting games. No cross-property entitlement
  sync, no user migration. (Grandfather existing Studio-Pass-for-games users.)
- **D5 — deadrot.com is playable-focused.** It does **no asset generation**;
  generation runs in the studio and writes into `deadrotcom/packages/assets`.
- **D6 — assetgen stays in the studio**, and is the **only** generation surface
  — never generate inside a product repo. Renders are pushed into the product.
- **D7 — The Studio is a multi-IP cockpit.** Select IP → select game → full
  build toolchain (generate, lore, play-test). Backed by an explicit **project
  registry** that replaces assetgen's hardcoded `../deadrotcom` sibling path.

## Answers to the founding questions

| Question | Answer |
|---|---|
| Move the gen tools into deadrot? | **No** — already in the studio; stop generating from the deadrot folder, run `assetgen`. |
| Sell games only in deadrot? | **Yes** — games are bought + gated on deadrot (its Clerk); shipshit.games sells tools + courses and *links* to the games. |
| Make shipshit.games the hub? | **Yes** — as the brand/discovery hub + studio + tools/courses store. |
| Keep a Clerk on deadrot? | **Yes** — deadrot owns its players + game gates. |
| Run games from shipshit.games? | **Yes** — via a Studio "Play pane" for dev iteration (separate workstream, below). |

---

## Target topology

| Domain | Purpose | Auth | Sells |
|---|---|---|---|
| `shipshit.games` | Gaming SaaS: build cockpit + tools/courses store + brand hub | **studio Clerk** (devs/learners) | Studio Pass, courses |
| `deadrot.com` | Deadrot franchise: lore + connected universe + **playable games** | **deadrot Clerk** (players) | Deadrot games / collection |
| `deadrot.com/<slug>` | Playable game (Vite SPA), gated by deadrot | deadrot Clerk | — |
| `api.shipshit.dev` | Studio API: tools/courses billing, asset jobs | webhook key | — |
| `<future-ip>.com` (later) | Next franchise satellite — own Clerk + gates | its own Clerk | its games |

### Identity & commerce — federated, decoupled

- **deadrot Clerk** owns Deadrot players + game gates + game purchases (Stripe).
  Unchanged operationally — this is the part you want to keep managing in deadrot.
- **studio Clerk** owns the tools/courses audience (Studio Pass + course access).
- **No bridge.** Studio Pass is tools/courses-only. The cross-property
  email-matching entitlement code in `deadrotcom/apps/web/lib/shipshit-entitlement*.ts`
  is **removed** (after grandfathering existing Studio-Pass-for-games users).
- shipshit.games **stops selling/gating individual games**; it lists them and
  links/routes to the franchise property to play + buy. This deletes the
  duplicate storefront.

### Discovery / catalog

shipshit.games aggregates each franchise's roster (`@deadrot/catalog`, then
`@<ip>/catalog`) into the brand hub via a small manifest
(`packages/shared/src/franchises.ts` + each franchise exposing
`/api/catalog.json`). Links out (or proxies) to the franchise property; it does
not own the player session.

### Reusable gating logic (optional, for the factory)

deadrot's proven gate logic *can* be extracted into a small shared library so
future franchises start from the same template — but it stays **per-franchise,
local, with each franchise's own Clerk**. It is **not** a cross-franchise
entitlement service and **not** a consolidation mechanism. Defer until the second
franchise actually needs it.

### The Studio cockpit — the SaaS build surface

`shipshit.games` is the **gaming SaaS**: where the tools are sold AND the cockpit
where games get built. Deadrot is the first **product built with it** (dogfood);
assets are generated **only here** and pushed into the product. The cockpit
(`apps/desktop` embedding the hosted portal) must let you:

1. **Select the IP** you're building (Deadrot, then future IPs).
2. **Select the game** within that IP to continue.
3. Use the **full build toolchain** against that selection: generate assets (one
   surface), browse/build lore, run + play-test the game, check integrity.

**Project registry (the seam to build).** Today `assetgen` and the Studio are
hardcoded to the single sibling `../deadrotcom`
(`packages/assetgen/src/commands/paths.ts`, sibling-relative, no real override).
To be multi-IP, replace that with an explicit **project registry**: each IP →
`{ repo path, catalog package, assets dir }`. The active selection drives
`--assets-dir` / `--root` for `assetgen`, the gallery source, and the play-test
target. `@deadrot/catalog` becomes one entry; new IPs register their own. This
generalizes the `DEADROT_ASSETS_PATH` idea into a real selector.

**Play-test inline.** The Studio already has node-pty + a 3D/asset previewer +
reads the assets package. Add a pane that launches the selected game's Vite dev
server (`bun --cwd <ip>/apps/games/<slug> dev`; ports from that IP's catalog) and
embeds `localhost:<port>` next to the generator. Loop: generate → render lands in
the IP's assets → Vite HMR → see it live. Local Vite is the "sandbox"; Vercel
Sandbox is a later option.

**Lore** is per-IP (lives in the product repo, e.g. `deadrotcom/apps/lore/content`),
editable from the cockpit; **courses** are studio-level (`packages/ressources`).

---

## Migration (small, reversible — no user migration)

**Step 1 — De-duplicate the storefront (reversible).** shipshit.games stops
selling/gating individual games; it becomes discovery + tools/courses and links
to deadrot for play/buy. Remove the game-purchase Stripe path + faction/game
sales surface from `shipshitgames/apps/web`.

**Step 2 — Decouple Studio Pass (reversible-ish).** Make Studio Pass
tools/courses-only. Grandfather current subscribers who have game access (keep a
flag or one-time grant on the deadrot side). Then **remove the bridge**:
`deadrotcom/apps/web/lib/shipshit-entitlement*.ts` and its proxy hooks. Deadrot
games are now gated purely by deadrot Clerk + deadrot Stripe.

**Step 3 — Tighten the asset loop.** Generation only from the studio (`assetgen`,
never raw `gpt-image-2` in the deadrot folder). Optionally build the Studio "Play
pane" for one-window iteration.

**Step 4 — Franchise factory (later).** `apps/cli` scaffolds the next franchise
as its own playable property (own Clerk + gates), and shipshit.games lists it in
the hub.

## Top risks

| Risk | Sev | Mitigation |
|---|---|---|
| Decoupling Studio Pass strips game access from existing subscribers | MED | Grandfather: one-time permanent grant on the deadrot side for current Studio-Pass-for-games users before removing the bridge; email them the change |
| Removing the duplicate storefront breaks shipshit.games game links | LOW | Replace buy/play buttons with links/redirects to deadrot; keep `@deadrot/catalog`-driven listings |
| assetgen sibling-path heuristic breaks if repos move | LOW | Don't move it; add `DEADROT_ASSETS_PATH` env override + graceful failure |
| Per-franchise account silos as more IPs launch | LOW (later) | Acceptable now (each franchise owns its players); revisit optional studio SSO only if cross-franchise accounts become a real need |

## Open decision (the one genuine fork)

- **Does shipshit.games host any game checkout, or only discovery + links?**
  Recommended: **discovery + links only** (games bought + gated + played on the
  franchise property). Putting a *buy* button on shipshit.games while *gating* on
  deadrot would re-introduce a cross-property grant — i.e. the bridge you're
  removing. Keep buy + gate + play together on deadrot.

Defaulted, flip anytime: Studio Pass = tools/courses-only (D4); deadrot.com stays
a permanent playable franchise hub (D5); Stripe products named `prod_<Franchise>`.

---

## Canonical memory deltas

**Applied here** to `shipshitgames/.agents/memory/repo-boundary.md` (this branch).

**To apply in the `deadrotcom` repo on `master`** (NOT applied now — that repo is
on in-progress branch `codex/lore-art-map`; applying here would contaminate it):

```md
# in deadrotcom/.agents/memory/repo-boundary.md
- bump last_verified to 2026-06-19
- under "Owns", make explicit:
  - Deadrot player identity + game gating + game purchases (its own Clerk +
    Stripe). deadrot.com is the playable franchise hub.
- under "Does Not Own", add:
  - Asset GENERATION (runs in the studio; renders are written here).
  - Tools/courses commerce (sold on shipshit.games to a different audience).
- add a status note:
  Status (2026-06-19): Deadrot is the FIRST franchise under the Ship Shit Games
  umbrella (see ../shipshitgames/STUDIO-ARCHITECTURE.md). deadrot KEEPS its own
  Clerk + Stripe + game gates (playable-focused). Studio Pass is being decoupled
  to tools/courses-only; the cross-property bridge in
  apps/web/lib/shipshit-entitlement*.ts is being removed after grandfathering
  existing game-access subscribers. No Clerk consolidation / user migration.
```
