# Transcripts

Drop authorized transcript text here with a `.resource.json` sidecar.

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
