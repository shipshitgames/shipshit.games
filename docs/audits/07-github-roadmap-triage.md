# GitHub Roadmap Triage — shipshitgames/shipshit.games

Date: 2026-07-03
Scope: all open issues (82), all open PRs (11), last 30 closed issues/PRs, cross-checked against `STUDIO-ARCHITECTURE.md` (D1–D7), `.agents/memory/repo-boundary.md`, `.agents/memory/MEMORY.md`, and current code on `master`.

Read-only audit. Nothing on GitHub was modified.

---

## 1. Inventory

**Open issues: 82** (task prompt said ~93 — actual live count via `gh issue list --state open` is 82; 30 issues closed in the last window, high merge velocity, see §4).

**Open PRs: 11** — all created 2026-06-20 to 2026-06-22, all still open as of 2026-07-03 despite green-ish CI. Branch naming (`feat/<issue#>-slug`) maps 10 of the 11 PRs 1:1 to still-open issues — **the code is done, the issue just wasn't closed.**

| PR | Issue | Title | CI |
|---|---|---|---|
| #288 | #185 | Slice Asset Lab pose sheets into frames | Secret Scan FAIL |
| #287 | #83 | Add Studio Gyms launcher | Monorepo Checks FAIL, Secret Scan FAIL |
| #286 | #248 | Add desktop Studio e2e smoke suite | Monorepo Checks FAIL, Secret Scan FAIL |
| #285 | #162 | Enable assetgen and React Doctor CI gates | **green** |
| #284 | #186 | Move Asset Lab images to object storage | Monorepo Checks FAIL, Secret Scan FAIL |
| #283 | #150 | Add reference-backed assetgen prompts | **green** |
| #282 | #46 | Resolve shared assets from CDN | Monorepo Checks FAIL |
| #281 | #25 | Complete per-game landing page build path | Monorepo Checks FAIL |
| #280 | #24 | Data-driven game gallery cards | Monorepo Checks FAIL |
| #278 | — | fix(assetgen): add brawl+warline to GAME_SLUGS | green |
| #277 | #98 | feat(ressources): inventory commands | green |

**Root cause of every "Monorepo Checks" failure (verified, not per-PR):** `packages/assetgen#typecheck` fails on a pre-existing bug in `packages/assetgen/src/legal.test.ts` (line 38: duplicate `plan` key / type mismatch in a test helper) that predates all 11 branches. PR #280's own body confirms this independently ("blocked by pre-existing unrelated `packages/assetgen/src/legal.test.ts` errors"). **This is a single fix that unblocks 6 stuck PRs.** "Secret Scan" failures on #288/#287/#286/#284 are a separate, likely false-positive pattern (needs one-off look, not covered by the typecheck fix) — recommend a quick look at the actual matched string before assuming they're real leaks.

**Labels** (top): enhancement 58, studio 42, design-assets-arch 31, p3 16, integration 14, p2 14, ressources 12, p1 13, size:m 11, tool 9, p0 8, no-label 8, desktop 7, cli 6, size:s 6, toolbox 6, epic 5.

**Milestones** (all "Phase N" epics, 10 total): Phase 3a Assets (P0/P1 core) 15, Phase 6a Studio (P0/P1 core) 11, Phase 6b Studio (desktop/CLI) 10, Phase 3c Assets (cleanup) 10, Phase 5 Canon+legal 9, Phase 6c Studio toolbox/engine 7, Phase 3b Assets tooling 6, Phase 6d Studio backlog/P3 5, Phase 4 AI-gen pipeline 5, Phase 2 Tokens 4.

**Assignees:** 80/82 unassigned; 2 assigned to `VincentShipsIt`. No team distribution — this is a solo-operated, agent-driven backlog.

**Age:** every open issue was created 2026-06-03–06-20 and last updated 2026-06-21–06-25. **Nothing is stale by the 30-day bar** — the entire backlog was bulk-generated (uniform PRD template: "Problem / Goal / Scope In/Out / Acceptance criteria") within a ~3 week window, most likely from a planning pass, not organic accumulation. Issue-tracker "staleness" here isn't about age, it's about **drift from what code already shipped** (see §2/§3).

---

## 2. Duplicate / stale / obsolete candidates

### Confirmed obsolete — code already ships the described work

| # | Title | Evidence |
|---|---|---|
| **#26** | Scaffold apps/app members portal with auth | `apps/app` exists in full (app/components/lib), Clerk-based, with `apps/app/lib/entitlements.ts` implementing account/subscription state. Fully built. |
| **#27** | Add monthly Studio Pass checkout | `apps/web/app/api/checkout/route.ts` + `apps/web/lib/skills-pro.ts` + `apps/web/scripts/provision-skills-pro-stripe.ts` already implement monthly Stripe Checkout with founder coupon. PRD text is stale ("lifetime All Access" framing predates D4's monthly-subscription model, which is what's actually built). |
| **#28** | Sync monthly Studio Pass entitlements | `apps/app/lib/entitlements.ts` already models `active`, `status`, `currentPeriodEnd`, `stripeSubscriptionId`, via `isActiveSubscriptionStatus`; `apps/api/app/webhooks` and `apps/app/app/api/webhooks` both exist. Built. |
| **#203** | prod(api): finish DB network cutover and webhook dashboard config | Describes the Vercel-can't-reach-RDS problem (dated evidence from 06-11). `RELEASING.md` and merged commits (`fix(deploy): point production api at api.shipshit.dev + cutover runbook` #273, `fix(deploy): render api SSM env non-recursively` #279) show the API was migrated wholesale to **EC2 + Docker + Tailscale inside the RDS VPC** — a different architecture than the one #203 is trying to patch. Obsolete; superseded by the EC2 migration. |
| **#114** (already closed, confirms pattern) | Add local project registry | Closed 2026-06-20, and PR #256 (`feat(assetgen): multi-IP project registry`) is merged to master (`packages/assetgen/src/commands/registry.ts` + `paths.ts` consuming it). Cited here only to confirm the tracker *is* being closed correctly in some cases — the ones above simply slipped through. |

**Action:** close #26, #27, #28, #203 as already-shipped; verify with a one-line "shipped in X" comment if commenting is later authorized (this audit is read-only, so no comments were made).

### Confirmed near-duplicate pair

| # | Title | vs | Title | Similarity |
|---|---|---|---|---|
| **#31** | Add AI asset legal disclosures | **#59** | Add assetgen legal disclosures | 0.90 (title), but scopes differ on inspection |

On reading both bodies: #31 is the **site-wide legal surface** (footer links, EULA, privacy, refund policy, "AI-generated" disclosure pages) — Web/Portal/Business epic. #59 is **assetgen's internal license/provenance ledger** (per-asset DENY/ALLOW rules by provider, Steam AI-content disclosure string, human-review flagging) — Assets epic. **Not a true duplicate** — different systems, overlapping only in the word "legal disclosures." Recommend renaming one (e.g. #59 → "assetgen: per-asset license ledger + Steam disclosure string") to stop future bots/humans from merging them by mistake.

### Blueprint skill fan-out — verify before building

Issues #262–268 (7 issues, epic #258 "Game-type blueprint skills": moba/pactfall, platformer/redline, side-scroller/rothulk, space-shooter/starblight, fighting/brawl, strategy/warline, plus horde-shooter/scourge-survivors already closed as #265) are fanned out from one epic with near-identical bodies (title similarity 0.67–0.77, expected for a template fan-out, not a bug). **Zero blueprint skill files exist in the repo yet** (`find . -iname "*blueprint*"` returns nothing). This is legitimate unstarted work, not a duplicate — flagging only because the fan-out pattern means if the epic's shape changes, all 6 remaining children need a coordinated edit, not 6 separate ones.

### Issues that conflict with / predate locked decisions D1–D7

| # | Title | Conflict |
|---|---|---|
| **#183** | Align gallery with Starblight/Zero Day decision (Zero Mode) | Depends on an **external** decision tracked in the sibling repo (`deadrot.com#327`), not this repo's D1–D7. Not obsolete, but blocked on a cross-repo decision this audit cannot resolve — flag as blocked, not actionable here. |
| **#26/#27/#28** (see above) | — | Predate D4 (Studio Pass = monthly, tools/courses-only, no lifetime grant) — PRD language ("lifetime All Access entitlement") is the *old* pricing model. Code has already moved past this; issues are stale text, not stale work. |

No open issue proposes re-bridging the Clerk entitlement sync or re-adding a game storefront to `apps/web` — the dangerous "re-introduce the bridge" failure mode flagged as a risk in STUDIO-ARCHITECTURE.md has **not** shown up as an open ask. Good sign for tracker health on the one thing that mattered most.

---

## 3. Confirmed bugs (verified against code)

1. **`packages/assetgen/src/legal.test.ts` typecheck failure — real, currently broken on master's dependency graph.** Line 38 constructs a license object with a `plan` key that doesn't match the type shape expected elsewhere (duplicate/missing `plan` property per PR #280's own CI log). This single bug is failing "Monorepo Checks" on **6 of 11 open PRs** (#280, #281, #282, #284, #286, #287) — it is the single highest-leverage fix available: one small patch reopens the merge queue for a stack of already-reviewed, feature-complete work.
2. **"Secret Scan" CI failures on 4 open PRs** (#284, #286, #287, #288) — not yet root-caused in this pass (would need the actual matched pattern from the scan log, one more `gh run view --log-failed` per PR). Likely either a true positive worth an urgent look, or a scanner false-positive on a fixture/test string. **Do not merge these 4 without resolving this — treat as a possible real secret leak until proven otherwise.**
3. **`tsc` not on PATH in the local dev shell used for this audit** (`bun run --cwd packages/assetgen typecheck` → `tsc: command not found`, exit 127) — environment issue, not a code bug, but worth noting: local typecheck currently can't be verified without going through `bun install`/binstubs first, which may explain why the `legal.test.ts` regression slipped past whoever last touched that file locally.

No other functional bugs were found in the spot-checked areas (checkout route, entitlements, game gallery, project registry).

---

## 4. Roadmap themes / epics

Grouped by actual code surface, not by GitHub milestone label (milestones are useful for phase sequencing but blur the picture of what's still needed vs. done):

1. **Asset pipeline / assetgen core** (largest theme — ~30 issues across Phase 2/3a/3b/3c/4/5). Project registry (D7) is **done**. Remaining: sprite tooling (atlas packing, QA workbench, video sprite expansion, Piskel/Pixelorama decisions), token distribution to games, legal/license ledger (#59), AI map generator (#91, planning-stage epic).
2. **Studio cockpit** (`apps/desktop`, `apps/app`, `apps/cli` — Phase 6a/6b/6c, ~35 issues). Desktop app scaffolding exists (`main/preload/renderer`). Architecture-definition issues (#108, #109) are design-decision issues, not implementation — check whether they're already answered by STUDIO-ARCHITECTURE.md before treating as open work.
3. **Studio Pass / monetization** (Phase 6d + scattered). **Mostly already shipped** — see §2 obsolete list. Real gap: no evidence of a live/verified Stripe product (env vars for `STRIPE_STUDIO_PASS_PRICE_ID` are blank in `.env.example`; provisioning script exists but running it against production hasn't been confirmed by this audit).
4. **Courses / ressources toolbox** (Phase 6c + Phase 5, ~15 issues, epic #96). `packages/ressources` has infrastructure (sources/transcripts/derivatives/schemas, inventory CLI, validation CI) but **zero packaged, sellable course content** — see revenue note below.
5. **Blueprint skills / Build Plan engine** (epic #258, 6 open children). Build Plan engine itself already merged (#257, #260 closed). Per-game blueprint skills are the only unstarted leaf work in this theme.
6. **Infra/deploy** (scattered p0/p1: #143, #203, #247). Deploy pipeline (EC2/Docker/Tailscale for `api`, Vercel for web/app/docs) is live per RELEASING.md and recent merged commits — #203 is stale (see §2). #143 (engine canonicalization) is a decision-record issue; check if `packages/engine/CANONICAL-ENGINE.md` (referenced in memory) already answers it.

---

## 5. Blockers / dependencies

- **The `legal.test.ts` typecheck bug is the single biggest blocker in the repo right now** — it's gating merge on 6 PRs representing real, reviewed feature work (game gallery, per-game landing pages, CDN asset resolution, Studio Gyms launcher, e2e smoke suite, Asset Lab image migration). Nothing else in this audit has anywhere near this leverage-to-effort ratio.
- **#183** (Zero Day/Starblight gallery alignment) is blocked on a decision tracked in the sibling `deadrot.com` repo (`#327`) — cannot be resolved from this repo alone.
- **Secret Scan failures** block 4 PRs and need a human/security look before any of them merge — don't unblock by disabling the check.
- **Blueprint skills (#262–268)** depend on the Build Plan engine's `ingest-docs`/genre-detection work, which is already merged (#260/#271, #275/#276) — no longer blocked, ready to start.
- **Studio Pass going live for real revenue** depends on: (a) confirming Stripe price/product IDs are provisioned in production (not just scaffolded in code), (b) `packages/ressources` producing at least one packaged course, since Studio Pass's value prop per D2 is tools **+ courses**, and courses don't exist as sellable units yet.

---

## 6. Suggested issue labels / milestones

The label/milestone scheme is already solid (phase-based milestones, p0–p3 priority, size:s/m estimates) — no restructure needed. Additions worth making next time issues are edited:

- **`status:shipped-verify`** — for #26, #27, #28, #203 (and similar future cases) so "looks done in code, needs a close-out pass" is queryable instead of relying on ad hoc audits like this one.
- **`blocked:cross-repo`** — for #183 and any future issue whose resolution depends on a decision/PR in `../deadrot.com`.
- **`ci:flaky-or-shared-failure`** — for the 6 PRs failing on the shared `legal.test.ts` bug, so it's obvious at a glance these aren't PR-specific regressions.
- Milestone hygiene: consider collapsing **Phase 6d** (5 issues, all p3, "Studio backlog/P3") into the relevant Phase 6a/6b/6c parents — it currently reads as a junk-drawer milestone rather than a phase.

---

## 7. Ranked backlog (top ~20)

Ranked by **leverage** (unblocks other work or revenue) over raw priority label, since code evidence contradicts several GitHub priorities (see rule in the task brief).

1. **Fix `packages/assetgen/src/legal.test.ts` typecheck bug.** Not itself a GitHub issue — file one, or just fix it directly. Unblocks 6 stuck, already-reviewed PRs immediately. Highest ROI in the entire backlog.
2. **Triage the 4 "Secret Scan" CI failures** (#284/#286/#287/#288's PRs). Must resolve before merge regardless of priority — could be a real leak.
3. **Close #26, #27, #28, #203 as shipped** (or verify + close). Zero implementation cost, immediately shrinks the backlog by 4 and stops future agents from re-implementing already-built features.
4. **#46 [P0] Consume shared asset manifest/CDN across studio apps** (PR #282 open, blocked only by #1 above). Real P0, code exists, just needs the typecheck unblock + merge.
5. **#186 [P0] Move Asset Lab generated images to the shared asset origin** (PR #284 open, blocked by #1 and #2 above — has both failure types). Real P0 per D6 (generation-in-studio-only correctness depends on assets landing in the right origin).
6. **#150 assetgen reference-image input** — PR #283 is fully green, ready to merge today, no blockers. Easiest immediate win.
7. **#162 Enable assetgen --check gates + lint:react in CI** — PR #285 is fully green, ready to merge today. Directly prevents the class of bug in #1 from recurring.
8. **#24 Build game gallery cards** — PR #280 open, blocked by #1. Confirmed correctly scoped to D1/D2 (discovery/links only, no purchase surface).
9. **#25 Build per-game landing pages** — PR #281 open, blocked by #1. Same theme as #24.
10. **#83 Add Studio Gyms launcher** — PR #287 open, blocked by #1 and #2.
11. **#248 desktop Studio e2e smoke suite** — PR #286 open, blocked by #1 and #2. High value once merged (guards the desktop cockpit from regressions going forward).
12. **#185 slice Asset Lab pose sheets into frames** — PR #288 open, blocked by #2 only (Secret Scan; no Monorepo Checks failure listed).
13. **#98 ressources inventory commands** — PR #277, green and likely mergeable now; confirm and merge.
14. **Provision + verify Studio Pass Stripe product in production** (no issue number — gap identified in this audit). Blocks real revenue; currently unclear whether `STRIPE_STUDIO_PASS_PRICE_ID` is set anywhere outside `.env.example`.
15. **#59 assetgen legal + disclosure ledger** — p3 in GitHub but functionally gates any AI-asset commercial use claims (Steam disclosure, DENY/ALLOW audio licensing). Recommend bumping priority given D2's dependence on the tooling being commercially clean.
16. **#258 epic + #262/#263/#264/#266/#267/#268 blueprint skills** — unblocked (Build Plan engine merged), zero files exist yet, straightforward mechanical fan-out once one is done as a template.
17. **#91 Plan AI map generator** — still planning-stage; fine to leave at current priority, no urgency signal found.
18. **#143 Keep @shipshitgames/engine canonical** — likely a paperwork/decision-record close given `packages/engine/CANONICAL-ENGINE.md` already exists per memory; verify then close quickly.
19. **#31 vs #59 legal disclosure disambiguation** — low cost, prevents future confusion; rename one issue title.
20. **#183 Zero Day/Starblight gallery alignment** — leave blocked, ping the `deadrot.com` side; not actionable solely from this repo.

---

## Appendix: D1–D7 decoupling progress snapshot

| Decision | Status | Evidence |
|---|---|---|
| D1 Multi-IP gaming SaaS | **In progress, on track** | Game gallery links out (Brief/Demo/Source), no purchase button — matches "discovery hub" framing. |
| D2 Three revenue lines by audience | **Partially real** | Studio Pass checkout code exists; courses (`packages/ressources`) has zero packaged sellable output yet. Game sales correctly absent from `apps/web`. |
| D3 Federated identity, two unbridged Clerks | **No evidence of a bridge in this repo** | No `shipshit-entitlement*` files found in shipshitgames (that file lives in `deadrotcom`, out of scope for this repo's audit, but nothing here re-creates it). |
| D4 Kill the bridge, Studio Pass tools/courses-only | **Code already reflects this** | `entitlements.ts` and checkout are monthly-subscription, tools/courses framed; stale PRDs (#26–28) describe the pre-D4 "lifetime" model but code moved past them. |
| D5 deadrot.com is playable-only, no gen | Out of scope (verify in deadrot.com repo). | |
| D6 assetgen is the only generation surface | **Consistent** | No raw generation calls found outside `packages/assetgen` in this repo. |
| D7 Project registry replacing hardcoded `../deadrotcom` path | **Done, merged** | `packages/assetgen/src/commands/registry.ts` + `paths.ts` (`selectedProject()` with fallback to legacy sibling-path heuristics) merged via PR #256, issue #114 closed. |
