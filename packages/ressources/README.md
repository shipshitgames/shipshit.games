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
# list known sources
bun packages/ressources/src/cli.ts sources

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

# optional: sync video metadata when yt-dlp is installed
bun packages/ressources/src/cli.ts sync-channel --source ai-oriented-dev --limit 50
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
