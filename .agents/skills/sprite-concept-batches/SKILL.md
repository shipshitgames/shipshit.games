---
name: sprite-concept-batches
description: Build reviewable Deadrot/Ship Shit Games concept prompt batches for sprites, weapons, textures, props, UI, FX, pickups, maps, and other asset-generation work. Use when planning or writing asset prompts, prompt collections, reference-backed generations, or gpt-image-2/Codex/fal batch instructions that must preserve the documented pixel-art canon.
---

# Sprite Concept Batches

Use this skill to turn asset needs into repeatable prompt batches with explicit reference slots. Keep generation work reviewable: prompt text, intended asset kind, game slug, and reference images must be clear before running providers.

## Canon Checks

Read the local canon before writing prompts:

- `apps/docs/content/lore/index.mdx`
- `DESIGN.md`
- `packages/assetgen/src/style.generated.ts`

If the sibling Deadrot lore repo is available, prefer it for game/entity specifics. Do not invent canon when lore is missing; write a prompt that preserves the locked style and call out the missing source.

## Prompt Shape

Use the structured prompt format:

```txt
Task: Generate one <asset kind> for <game>.
Main subject: <specific entity/object/material/UI state>.
Composition: <camera/view/sheet/frame/readability requirements>.
Style: <pixel-art canon, palette, lighting, parasite/faction rules>.
References: <slot -> path, or slot -> needed source>.
Negative: no text, watermark, smooth 3D, photorealism, anti-aliasing, neon cyan/magenta, cute/chibi, generic monster drift.
```

Preserve these rules:

- Scourge assets must read as host takeover: ruptured host material, invasive growth, tendrils, breach cores, parasite grammar.
- Toxic green belongs only to Scourge infection, breach cores, parasite nodes, and host takeover.
- Pyre/Warden/non-Scourge assets stay in black, bone, blood red, hellfire orange, rust, and gunmetal.
- Gameplay sprites need fuller/flatter lighting than hero plates so pixel cutouts stay readable.

## Reference Slots

Name references by slot:

- `style`: rendering style, lighting, palette, pixel fidelity.
- `silhouette`: approved role shape or pose.
- `palette`: DOOM/palette-lock file.
- `source`: validated input image for edits, expansions, or tier-sheet continuity.

When a reviewed source exists, use it. Do not replace it with a new invented reference. For assetgen CLI runs, pass local reference images with `--reference <path>` or `-i <path...>`; put the text prompt before `-i`.

## Batch Output

For each asset, return:

- `id`
- `kind`
- `game`
- `prompt`
- `references`
- `providerHint` (`codex`, `openai`, `fal`, or `mock`)
- `reviewNotes`

Use `mock` only for plumbing checks. Use `codex`/`gpt-image-2` for real concept images unless the task explicitly names another provider.
