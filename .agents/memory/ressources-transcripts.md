# Ressources transcript fetching

last_verified: 2026-06-09

`packages/ressources` captures YouTube transcripts into
`transcripts/<source>/*.transcript.md` + `.resource.json` sidecars.

## Gotcha: yt-dlp is required; the watch-page scrape is dead

The package's original "zero native deps" path (scrape the watch page for the
caption `baseUrl`, fetch `&fmt=json3`) no longer works. YouTube now returns
**HTTP 200 with an empty body** unless the request carries a player-generated
`pot` token. So `yt-dlp` is effectively **required** for any network capture:

```bash
brew install yt-dlp        # override the binary path via RESSOURCES_YT_DLP
```

The only true no-network path is `distill --transcript-file <path>` on text you
already have.

## Fetch both manual and auto subs (route around 429, don't retry)

`src/transcript.ts` requests BOTH `--write-subs` (manual) and
`--write-auto-subs` (auto) English captions and prefers the manual track.
Manual subs are higher quality AND live on a separate endpoint, so a video with
creator-uploaded EN subs still captures when the **auto-caption endpoint is
rate-limited (HTTP 429)**. Lesson learned the hard way: when one caption source
429s, retrying the same endpoint doesn't help — route around to the equivalent
manual-subs source instead. (Fixed in PR #165; before that, auto-only requests
failed whole fetches.)

## Workflow notes

- Run throwaway fetch scripts from **inside** `packages/ressources` so bun
  resolves the package's own modules; reuse `createTranscriptResource` rather
  than hand-rolling sidecars (keeps them schema-valid — `cli.ts validate`
  passes first try). Clean the `*.tmp.ts` up after.
- yt-dlp warns "no impersonate target available"; install `curl_cffi` to cut
  429s if fetching at volume.
- Source manifests need `rights.storeRawTranscript: true` + a known transcript
  `rights.status` (e.g. `public-captions`) or `validate` rejects stored raw
  text. See [[repo-boundary]] — ressources is studio/learning tooling, not
  shipped game content.
