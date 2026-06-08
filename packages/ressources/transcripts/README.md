# Transcripts

Drop authorized transcript text here with a `.resource.json` sidecar.

Before committing raw text, check the matching
`packages/ressources/sources/<source>/source.json` manifest:

- `rights.storeRawTranscript` must be `true`
- the transcript sidecar `rights.status` must be known, not `unknown`
- derivative rules, skills, apps, and tools should store original distilled
  notes, not raw transcript dumps

Use:

```bash
bun packages/ressources/src/cli.ts new-transcript \
  --source ai-oriented-dev \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --title "Video title"
```

The transcript markdown is the raw evidence. The sidecar is the provenance and
review trail. Distilled rules, skills, apps, and tools belong under
`derivatives/`.
