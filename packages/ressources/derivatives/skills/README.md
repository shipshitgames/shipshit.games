# Skills

Candidate agent skills extracted from resource patterns.

Promote one of these into `.agents/skills/<name>/SKILL.md` only after the
workflow is specific, repeatable, and grounded in repo needs.

Run the promoter in review mode first:

```bash
bun packages/ressources/src/cli.ts promote-skill \
  --candidate packages/ressources/derivatives/skills/<name>.resource.json \
  --dry-run
```

After reviewing the provenance and full generated diff, replace `--dry-run`
with `--approve`. The command refuses unreferenced candidates and never copies
raw transcript text into a skill.
