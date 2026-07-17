# @shipshitgames/ressources

Studio learning library for transcripts, articles, channel notes, and the
derived skills/apps/tools we build from them.

The path is intentionally `packages/ressources` because that is the requested
workspace package. Treat it as the human learning and agent-knowledge layer that
owns transcript capture, distillation, source manifests, and derived
skills/apps/tools.

There is no separate legacy research package. The legacy `research` binary name
remains only as a compatibility alias to this package's CLI entrypoint.

```txt
source/channel -> transcript/resource -> distilled rule -> skill/app/tool candidate
```

## What Belongs Here

- source manifests for YouTube channels, articles, courses, docs, and books
- transcript metadata plus authorized transcript drops
- derived build rules, skill candidates, app specs, and tool specs
- review notes that explain why a source matters to game production

Do not put shipped Deadrot assets here. If a resource becomes a generated game
asset, it still ships from `../deadrotcom/packages/assets`.

## Raw Transcript Rights

Every source manifest declares:

- `rights.transcriptPolicy` - the expected provenance for transcript text
- `rights.storeRawTranscript` - whether raw transcript files may live in this
  repo for that source
- `rights.notes` - source-specific handling guidance

Only commit raw transcript text when `storeRawTranscript` is `true` and the
transcript sidecar records known rights such as `user-provided`, `permissioned`,
`official-api`, or `public-captions`. Sources with `storeRawTranscript: false`
should remain as links plus original distilled notes. Derivative rule, skill,
app, and tool files should never be raw transcript dumps.

Run this before promoting new source or transcript material:

```bash
bun packages/ressources/src/cli.ts validate
```

## AI Oriented Dev

`sources/ai-oriented-dev/source.json` is the first priority channel:

- handle: `@AIOriented`
- channel id: `UCE4PyAWiZ5gdPVFxDe4lLPQ`
- url: `https://www.youtube.com/@AIOriented`

The package stores metadata and authorized transcript drops. Avoid committing
raw copyrighted captions unless they are user-provided, permissioned, or clearly
allowed for this repo. Prefer distilled rules and original implementation notes
for reusable skills/apps/tools.

## Fetching transcripts (yt-dlp required)

YouTube no longer serves caption text to the old dependency-free watch-page
scrape — the `timedtext` `baseUrl` now returns an empty body without a
player-generated `pot` token. **Install `yt-dlp`** for any network capture:

```bash
brew install yt-dlp   # or: pipx install yt-dlp
```

`fetchTranscript` requests both **manual** (`--write-subs`) and **auto**
(`--write-auto-subs`) English captions and prefers the manual track — higher
quality, and it sidesteps the auto-caption endpoint's HTTP 429 rate limiting.
Point `RESSOURCES_YT_DLP` at a custom binary if it is not on `PATH`; every
yt-dlp call (`fetchTranscript` and `sync-channel`) honors it. Note that
`distill` shells out to `codex`, not yt-dlp, so it is unaffected — and its
`distill --transcript-file <path>` form is a separate no-network path that
distills text you already have.

## Commands

```bash
# inventory known sources, transcripts, and derivatives
bun packages/ressources/src/cli.ts sources
bun packages/ressources/src/cli.ts transcripts
bun packages/ressources/src/cli.ts derivatives

# validate source manifests, transcript sidecars, and derivative manifests
bun packages/ressources/src/cli.ts validate

# fetch a YouTube transcript and distill it into reusable build rules
bun packages/ressources/src/cli.ts distill \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --out packages/ressources/derivatives/rules/video-slug.md

# already have a transcript? distill it without network
bun packages/ressources/src/cli.ts distill \
  --transcript-file transcript.txt \
  --title "Video title" \
  --out packages/ressources/derivatives/rules/video-slug.md

# create a transcript placeholder and sidecar metadata
bun packages/ressources/src/cli.ts new-transcript \
  --source ai-oriented-dev \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --title "Video title"

# create a skill/app/tool candidate from one or more transcript resources
bun packages/ressources/src/cli.ts new-derivative \
  --kind skill \
  --slug ai-oriented-level-design-loop \
  --title "AI Oriented Level Design Loop" \
  --source-transcript transcripts/ai-oriented-dev/video-slug.resource.json

# review and promote a skill candidate into .agents/skills/<slug>/SKILL.md
bun packages/ressources/src/cli.ts promote-skill \
  --candidate packages/ressources/derivatives/skills/ai-oriented-level-design-loop.resource.json \
  --dry-run
bun packages/ressources/src/cli.ts promote-skill \
  --candidate packages/ressources/derivatives/skills/ai-oriented-level-design-loop.resource.json \
  --approve

# optional: sync video metadata when yt-dlp is installed
bun packages/ressources/src/cli.ts sync-channel --source ai-oriented-dev --limit 50
```

## Skill Promotion

`promote-skill` is the review gate between a derivative candidate and an active
agent skill. It reads a `derivatives/skills/*.resource.json` sidecar, validates
every referenced transcript and distilled-rule sidecar, and generates or
updates `.agents/skills/<slug>/SKILL.md`.

The generated skill always includes trigger rules, workflow, inputs, outputs,
verification, a review gate, and provenance. The promoter reads transcript
metadata to validate provenance but never reads or copies raw transcript
content. Candidates containing a `Raw Transcript` section are rejected.

Review process:

1. Make the derivative candidate original, specific, repeatable, and grounded
   in repository needs.
2. Reference at least one transcript sidecar with `--source-transcript` or
   distilled rule sidecar with `--source-rule`; bare transcript text is not a
   source reference.
3. Run `promote-skill --dry-run` and review the complete diff.
4. Run the same command with `--approve` only after the provenance and workflow
   pass review. Writes without `--approve` are refused.
5. Review and commit the generated skill normally; promotion never commits or
   publishes by itself.

Use `--root <library-dir>` and `--skills-root <dir>` for fixture libraries or
other explicit targets. Both candidate outputs and provenance references are
confined to the declared library root.

## Inventory

`sources`, `transcripts`, and `derivatives` make the library inspectable for
humans and tools. Each prints an aligned table by default and stable JSON with
`--json`, and each exits non-zero when it reads a malformed or schema-invalid
record (the valid records still list). Point any of them at another library tree
with `--root <dir>` (expects `<dir>/sources`, `<dir>/transcripts`,
`<dir>/derivatives`); the schemas in this package stay the canonical rules.

Inventory is a fast lister plus a shape check. Cross-file referential rules
(slug uniqueness, transcript→source links, file existence) stay the job of
`validate`.

```bash
bun packages/ressources/src/cli.ts sources
```

```txt
SLUG             KIND             PRIORITY   STATUS  TRANSCRIPTS  TITLE
---------------  ---------------  ---------  ------  -----------  ---------------
ai-oriented-dev  youtube-channel  primary    active  3            AI Oriented Dev
dogs-dream       youtube-channel  inbox      active  1            Dog's Dream
```

The `--json` form carries the fields the desktop app needs to render lists
without parsing any markdown:

```bash
bun packages/ressources/src/cli.ts sources --json
```

```json
{
  "schemaVersion": 1,
  "kind": "sources",
  "count": 18,
  "items": [
    {
      "slug": "ai-oriented-dev",
      "title": "AI Oriented Dev",
      "kind": "youtube-channel",
      "priority": "primary",
      "status": "active",
      "url": "https://www.youtube.com/@AIOriented",
      "topics": ["ai-assisted-development", "game-production"],
      "desiredOutputs": ["rule", "skill", "app", "tool"],
      "transcriptPolicy": "user-provided",
      "storeRawTranscript": true,
      "transcriptCount": 3,
      "path": "sources/ai-oriented-dev/source.json"
    }
  ],
  "errors": [],
  "warnings": []
}
```

`transcripts --json` adds `sourceSlug`, `sourceKind`, `capturedAt`,
`transcriptPath`, `rightsStatus`, `tags`, and a `derivativeCount`;
`derivatives --json` adds `kind`, `status`, `summary`, `outputPath`, `tags`,
`sourceTranscripts`, and a `sourceTranscriptCount`. A malformed record lands in
`errors` and forces a non-zero exit:

```json
{ "kind": "sources", "count": 1, "items": [/* valid records */],
  "errors": ["sources/broken/source.json: invalid JSON (…)"], "warnings": [] }
```

## Transcript Flow

1. Create a transcript stub with `new-transcript`.
2. Confirm the source manifest permits raw transcript storage and the sidecar
   rights status is known.
3. Drop the transcript text into the generated `.transcript.md` file, or capture
   it with `distill --out-transcript`.
4. Run `validate`.
5. Distill the transcript with `packages/ressources` into a rules markdown file.
6. Promote the rules into a derivative skill/app/tool candidate here.

Example:

```bash
bun packages/ressources/src/cli.ts distill \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --out packages/ressources/derivatives/rules/video-slug.md \
  --out-transcript packages/ressources/transcripts/ai-oriented-dev/video-slug.transcript.md
```

## Directory Map

```txt
sources/
  ai-oriented-dev/
    source.json
    videos.json          # optional generated metadata sync
transcripts/
  <source-slug>/
    <video-slug>.resource.json
    <video-slug>.transcript.md
derivatives/
  rules/
  skills/
  apps/
  tools/
templates/
schemas/
```

## Schemas

The JSON Schemas in `schemas/` are the single source of truth for manifest
shape. `validate` loads them at runtime and checks every `source.json`,
transcript `*.resource.json`, and derivative `*.resource.json` against the
matching schema, so the published schema and the enforced rules can never drift
apart. Referential checks (slug uniqueness, transcript→source links, file
existence) and the raw-transcript-storage rights rule run on top of the schema
pass.

Point `validate` at another library tree with `--root <dir>` (it expects
`<dir>/sources`, `<dir>/transcripts`, and `<dir>/derivatives`); the schemas in
this package stay the canonical rules used for the check.

## CI Fixtures

The committed `fixtures/valid` and `fixtures/invalid` libraries use original
placeholder text and `example.com` URLs, so CI can exercise source, transcript,
and derivative records without storing third-party material. The focused gate
typechecks the package, validates the real and valid-fixture libraries, asserts
useful errors for every invalid record kind, and smoke-tests `new-transcript`,
`new-derivative`, and mock distillation in a temporary package copy:

```bash
bun run ci:ressources
```
