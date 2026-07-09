# Project and Roadmap Audit — 2026-07-09

Base reviewed: `master` at `572c139`

Scope: repository architecture, all current-repository pull requests, every
commit from 2026-06-25 through 2026-07-09, local worktrees/branches, live GitHub
Project #4, and all open issues.

## Executive Result

- The repository is a healthy, fast-moving studio monorepo with strong cores in
  `packages/assetgen` and `packages/engine`, but its hosted security, packaged
  desktop, release workflow, and canonical cross-package contracts lagged the
  product ambition.
- There were **zero open pull requests** in `shipshitgames/shipshit.games` at
  audit start. Nothing pre-existing could or needed to be merged. The latest
  merged PR was #309, and required checks on `master` were green.
- The 14-day review covered **all 20 commits**. It found a cross-tenant Asset
  Lab exposure, incorrect fal reference-image requests, storage/ZIP failure
  paths, a tester false-success path, and a CI gate that could pass while
  checking zero targets. The audit branch repairs those issues.
- The live roadmap had 86 open issues, ten off-board tickets, seven stale Human
  Review items, seven stale In Progress items, no native dependency links, and
  only two native parent/child trees.
- Roadmap reconciliation closed 19 completed/superseded/wrong-repo issues,
  placed every remaining issue on Project #4, created five missing milestones,
  assigned issue types/priorities, added native hierarchy/dependencies, and
  created focused follow-ups #310–#319.
- Post-triage, pre-audit-merge state is **77 open issues, all 77 on the board**:
  60 Backlog, 8 In Progress, 7 Human Review, and 2 Deferred. Human Review now
  contains only paid-provider or external account/publishing actions.

The product direction is clear. The next engineering sequence is security and
release correctness, then canonical contracts and the local Deadrot loop, then
hosted job sync and templates.

## What This Repository Is

This is the Ship Shit Games studio/tooling monorepo, not the shipping source of
truth for Deadrot game assets or lore.

| Area | Role | Audit assessment |
| --- | --- | --- |
| `apps/web` | Public studio/game discovery, pricing, activity and roadmap | Healthy; roadmap status sync had drifted from live GitHub options |
| `apps/app` | Authenticated account, billing and Asset Lab | Useful product surface; entitlement ownership and provider reuse need consolidation |
| `apps/api` | Hosted asset, stats and webhook API | Highest prior security risk; tenant isolation fixed on this branch |
| `apps/desktop` | Local-first Shipshitcode cockpit | Direction is right; source-checkout command assumptions block a real DMG |
| `apps/docs` | Public product/tooling documentation | Builds cleanly; project map and lore paths needed refresh |
| `packages/assetgen` | Canonical asset generation/optimization/provenance CLI | Strongest package; broad tests and provider/tool coverage |
| `packages/engine` | Canonical reusable Three.js runtime | Strong core; needs manifest-consumer and supported-peer matrix tests |
| `packages/tester` | Generic browser-game QA harness | Good foundation; report persistence could previously produce false success |
| `packages/ressources` | Source/transcript/derivative toolbox | Foundation exists; explicit CLI validation CI remains |
| `apps/cli` | npm-facing studio CLI/scaffolder | Existing scaffold is narrower than the planned IP-monorepo factory |
| `packages/shared` | Small shared contracts/flags/catalogue | Healthy, but should remain intentionally small |
| `packages/ui` | Published React UI package | Technically healthy but underused by current applications |

Deadrot remains in `../deadrotcom`: lore in `apps/lore/content`, shipped runtime
assets in `packages/assets`, and playable games in `apps/games/*`.

## Repairs In The Audit Branch

### Security and data correctness

- Every Asset Lab list/read/file/ZIP/slice/reprint lookup now requires the
  authenticated owner in its database predicate.
- Asset bytes remain behind the authenticated API. New responses no longer
  disclose object-storage URLs; legacy URL rows are proxied server-side.
- Stored objects use their detected JPEG, PNG, or WebP media type and extension.
- Failed metadata writes compensate a completed object upload; concurrent slice
  uniqueness races recover the winning row instead of leaking an orphan.
- ZIP exports are capped at 64 assets and 32 MiB, checked against both metadata
  and loaded bytes.
- Tracking issue: #310. Remaining entitlement enforcement is #314.

### Provider correctness

- fal reference generations now use the documented
  `fal-ai/flux/dev/image-to-image` endpoint and `image_url`/`strength` schema.
- Unsupported reference counts/models fail before provider spend.
- Provider capabilities now state reference-image support honestly, while
  provenance retains the actual model rather than the transport endpoint.
- Replicate and other non-consuming adapters reject references instead of
  silently ignoring them.

### Reliability and maintainability

- Tester report writes create parent directories, change the final verdict to
  FAIL on persistence errors, refresh companion output, and return a nonzero
  CLI status. Tracking issue: #312.
- Desktop IPC channel names, request/response types, event payloads, and the
  `StudioApi` bridge now live in one shared contract. Five duplicated event
  subscription closures were collapsed. Existing issue #197 tracks this work.
- Web and docs now participate in the root typecheck.
- Roadmap sync has one status normalizer for Backlog, In Progress, Human Review,
  Done, and Deferred while retaining legacy Todo snapshots. Tracking issue:
  #313.

### Release and CI integrity

- Package publication is separated from application deployment. Execute mode
  requires clean synchronized `master`, rejects unknown legacy flags, resolves
  all unpublished packages, preflights all of them, and only then publishes.
- The script no longer bumps versions, rewrites consumers, creates surprise
  PRs, or directly deploys Vercel applications. Tracking issue: #311.
- The former cross-repo assetgen step was renamed to the honest Deadrot native
  asset integrity check. It no longer runs a non-strict assetgen command that
  can pass after discovering zero targets. The explicit future contract is
  #319.

## Remaining Risks, Ranked

### P0 — do before paid or packaged launch

1. **#314 — entitlement enforcement.** Authentication is not a paid-capability
   decision. Hosted generation must fail closed on inactive/missing Studio Pass
   state.
2. **#315 — one idempotent Stripe webhook owner.** Split fulfillment and
   duplicate/out-of-order delivery are incompatible with a trustworthy paid
   entitlement. Both #314 and #315 block live checkout #291.
3. **#316 — self-contained packaged desktop.** The current application bundle
   can launch, but core generation/research tooling resolves monorepo TypeScript
   paths that are absent from a clean DMG. This blocks #113.
4. **#49 — canonical asset manifest contract.** Assetgen, engine, desktop and
   Deadrot must share a generated/versioned schema before promotion #306.

### P1 — make the production loop dependable

5. **#317 — durable jobs and atomic quota reservation.** Count-before-spend can
   oversubscribe under concurrency; provider work needs persistent job/run
   state, retries, cost/timing and idempotency.
6. **#189 — remove the inline Asset Lab Replicate fork.** Hosted generation
   should consume a dependency-safe canonical provider module.
7. **#318 — engine consumer/peer matrix.** The package advertises an older
   Three.js peer range than the version it is tested against and lacks a packed
   producer-to-consumer smoke test.
8. **#319 — explicit target-aware assetgen CI.** Zero targets must be a chosen
   configuration, not an accidental green check.
9. **#305 — dependable gym/tester loop.** Launch must wait for readiness and
   attach tester artifacts to the selected asset/job rather than only opening a
   URL.

### P2 — structural follow-through

- #190, #195 and #196 remain valid desktop decomposition work: shared pane/task
  state, streamed subprocess plumbing, and project/settings orchestration.
- `apps/desktop/src/renderer/App.tsx` remains a large renderer even after type
  and IPC duplication was removed; split by feature only behind stable shared
  state boundaries.
- `@shipshitgames/ui` should either become the actual shared application UI
  layer or stay deliberately small; avoid publishing a parallel design system
  that consumers do not use.
- Reference provenance still stores local absolute paths. Promotion should
  persist stable hashes/project-relative source records rather than machine
  paths.
- API builds warn that Prisma tracing can include too much of the project, and
  the desktop renderer bundle is large. These are observable optimization
  targets, not reasons to hide warnings or raise limits.

## GitHub Roadmap Reconciliation

### Closed

Completed: #51, #52, #53, #59, #82, #101, #102, #143 and #204.

Superseded or moved to the correct Deadrot boundary: #12, #44, #45, #48, #50,
#87, #89, #108, #109 and #110.

### Re-scoped

- #49 now owns the canonical cross-package manifest contract and is P0.
- #56 retains only soft-grade/out-of-gamut work; reference conditioning exists.
- #92 retains desktop atlas preview/registration; the packer core exists.
- #100 retains explicit ressources CLI validation and invalid-fixture CI.
- #111 is packaged command validation/cancellation, not generic terminal setup.
- #112 is the real npm/npx/global-install publication check.
- #113 is signed/notarized DMG/cask work and is blocked by #316.
- #247 now covers only live ruleset bypass policy/documentation.
- #296 is the remaining ElevenLabs SFX lane, not legally unsupported in-game
  ElevenLabs music.
- #302 states the discovery delta from completed registry issue #114.
- #308 upgrades the existing scaffold to an IP-monorepo template.

### Board structure

- Added former off-board issues #291–#300 and audit issues #310–#319.
- Added Launch M0/M1/M2, Shipshitcode M5, and Rotforge M0 milestones.
- Assigned native Task/Bug/Feature types to #291–#319 where missing.
- Added #98–#107 under #96, #261–#268 under #258, #70/#93/#164 under
  #297, and #317 under #307.
- Added native blocker links for the Shipshitcode path:
  - #304 after #302/#303
  - #305 after #302
  - #306 after #49/#302/#303/#305
  - #307 after #302/#303/#306
  - #308 after #302/#306
  - #113 after #316
  - #291 after #314/#315

Human Review now means an actual person/external account is required: paid
Replicate/Suno smoke authorization (#3/#4), npm publication/2FA (#112), live
Stripe (#291), Skool (#292), Substack (#293), and playlist publishing (#299).

## Review Of Every Commit In The Last 14 Days

| Commit | Review result |
| --- | --- |
| `572c139` Shipshitcode roadmap/tester rename | Direction is sound; tester report-write false success repaired here |
| `fccb283` brawl/warline game slugs | Correct coverage expansion; no regression found |
| `bc5ffb4` React Doctor spread-sort fix | Correct, behavior-preserving |
| `1ef299f` July 3 roadmap audit | Useful historical snapshot; replaced by live July 9 reconciliation |
| `8878990` assets merge sort fix | Correct and later normalized by the React Doctor follow-up |
| `758ab41` per-game landing pages | Builds and typechecks; no regression found |
| `5cf133a` data-driven gallery cards | Builds and tests; no regression found |
| `c4845ad` shared CDN assets | Boundary is appropriate; no regression found |
| `d9219b2` assetgen/React Doctor gates | React gate works; assetgen cross-repo step was a zero-target no-op and is corrected here |
| `4e2a4c4` reference-backed prompts | Core path useful; fal schema/capability drift corrected here |
| `09fb845` pose-sheet slicing | Functional; concurrent uniqueness/orphan and ownership paths hardened here |
| `6a6604c` Studio Gyms launcher | Functional baseline; readiness/attached tester execution remains #305 |
| `d7c03f0` desktop smoke suite | Valuable and green; packaged-tool runtime remains outside its coverage |
| `9a82ed8` Asset Lab object storage | Introduced the highest-risk tenant/media/delivery issues repaired here |
| `ebb8b7d` ressources inventory | Sound foundation; explicit validation CI remains #100 |
| `eb5346f` unused Clerk proxy removal | Correct cleanup |
| `69b7ce8` legal source fallback | Correct defensive fallback |
| `7cd40e7` local Postgres example URL | Correct CI fixture allowance; no secret introduced |
| `4a69650` local env/docs URL overrides | Correct worktree/local-DX support |
| `64c59ee` Clerk frontend proxy removal | Correct cleanup |

## Verification

The audit branch passes the full repository gate:

```txt
bun run ci
  scaffold smoke
  engine build/typecheck/e2e
  design/token/content checks
  all 12 workspace typechecks
  coverage suites
  production builds for web/app/api/docs/desktop
```

Focused results include 657 assetgen tests, 115 desktop tests, 69 web tests,
41 tester tests, 15 API tests, and 11 engine end-to-end tests.

Warnings retained as follow-up evidence rather than suppressed:

- desktop renderer chunk is approximately 1.29 MB before gzip;
- API Next.js tracing warns that the Prisma/webhook import can trace too much of
  the project;
- Turbo reports coverage/build tasks without declared cache output files.

## Clear Next Sequence

1. Land the audit/security branch and close #197/#310–#313.
2. Implement #314 and #315; only then perform live Stripe #291.
3. Make the desktop self-contained (#316), then finish the local IP loader
   (#302) and explicit model commands (#303).
4. Canonicalize the manifest contract (#49).
5. Build desktop labs (#304), dependable gyms/tester (#305), and promotion
   (#306) in that order.
6. Add durable hosted jobs/sync (#317/#307).
7. Upgrade the IP factory/scaffold (#308) in Shipshitcode M5.
8. Develop Rotforge (#297) after the review/promotion loop is real.
9. Run funnel/content work in parallel; keep only unavoidable external actions
   in Human Review.

That sequence converts the current collection of capable tools into the actual
product: open an IP, generate and review an asset, preserve provenance, promote
it into the downstream package, run a game gym, verify it, and show the exact
diff without requiring the studio source checkout.
