/* GENERATED FROM lore/DESIGN.md v0.1.0 hash:41a70a28 — DO NOT EDIT. Run: bun assetgen tokens */
// Asset-generation style, compiled from the DESIGN.md `assetgen:` block + the
// lore Style-Bible. style.ts re-exports these; edit the bible, not this file.

export const STYLE_SUFFIX = "high-detail PIXEL ART game sprite on a visible chunky pixel grid (medium chunky, roughly a 110px-tall sprite), bold hand-placed pixels with hard crisp edges and NO anti-aliasing, ordered dithered shading, a clean silhouette-first readable shape with a subtle dark outline and a single hellfire rim-light from one low side (hellfire #ff6a00 into blood-hot #ff2a18) so it pops off a near-black background, fixed limited DOOM palette of #0a0a0a/#121214/#34343c body with #c1121f/#8a4b2a grime and #e9e3d6 highlights, premium modern pixel-art (Blasphemous, Dead Cells) crossed with remastered 1990s DOOM sprites, detailed but not noisy, NO neon, no text, no watermark, no UI, single subject only, near-black background, it MUST read as chunky pixel art made of visible square pixels, NOT a smooth 3D render, NOT photorealistic, NOT anti-aliased, NOT painted concept art";

export const NEGATIVE_PROMPTS: string[] = [
  "smooth 3D render",
  "rendered 3D model",
  "photorealistic",
  "photographic",
  "anti-aliased smooth edges",
  "airbrushed",
  "painted concept art",
  "blurry",
  "hi-fi render",
  "cel-shaded cartoon",
  "anime",
  "cute",
  "chibi",
  "slender elegant graceful proportions",
  "symmetrical pretty anatomy",
  "clean plate-armor fantasy knight",
  "medieval robes capes or swords",
  "clean minimal sci-fi",
  "superhero proportions",
  "soft diffuse even lighting",
  "bright daylight",
  "pastel colors",
  "rainbow saturation",
  "cool blue or teal grade",
  "magenta cyan or any neon glow",
  "clean white background",
  "background scenery or landscape",
  "multiple characters",
  "text watermark or logo",
  "UI frames or HUD",
  "cropped or close-up framing that hides the silhouette"
];

export const GAME_FRAMING: Record<string, string> = {
  "scourge-survivors": "first-person game billboard sprite, front-facing, full body",
  "deadlane": "top-down / high-angle game sprite, silhouette readable from above",
  "pactfall": "isometric 3/4-view game sprite, champion scale",
  "starblight": "side-on / top-down arcade space-shooter sprite, crisp readable silhouette",
  "redline": "side-on Sonic-like runner sprite, profile silhouette readable at courier-lane speed",
  "rothulk": "side-on Mario-like platformer sprite, profile silhouette, clear readable pose",
  "shared": "game asset"
};

export const KIND_MAP: Record<string, string> = {
  "texture": "seamless tileable texture"
};

export const SCOURGE_RULE = { pattern: /\bscourge\b/i, clause: "Scourge subjects must read as one parasite army wearing conquered host races: ruptured host flesh, invasive tendrils, embedded toxic-green (#8bdc1f) breach cores, black chitin over stolen bone/metal, fused wreckage or machinery; vary host family among flesh, chitin, mycelial, machine-graft, bone-titan, or voidship; never a standalone generic demon or alien; if it lacks this grammar it is only a monster, not the Scourge" };

export const GRADE_PARAMS = {
  "pixelGrid": 110,
  "downscale": "box",
  "nearestFilter": true,
  "dither": "ordered",
  "antialias": false,
  "hardRemap": true,
  "targetPalette": "doom",
  "palettePath": "lore/Art/grade/doom.gpl",
  "outline": "subtle-dark",
  "preserveEmissive": true,
  "blackPoint": "#0a0a0a",
  "encode": "webp-lossless",
  "cutout": {
    "tool": "rembg",
    "order": "after-generate-before-downscale"
  }
} as const;

export const STYLE_REF: Record<string, string> = {
  "scourge-survivors": "lore/Art/style-refs/scourge-survivors.webp",
  "deadlane": "lore/Art/style-refs/deadlane.webp",
  "pactfall": "lore/Art/style-refs/pactfall.webp",
  "starblight": "lore/Art/style-refs/starblight.webp",
  "redline": "lore/Art/style-refs/redline.webp",
  "rothulk": "lore/Art/style-refs/rothulk.webp",
  "shared": "lore/Art/style-refs/scourge-survivors.webp"
};

export const PROVIDER_SETTINGS = {
  "default": "openai",
  "size": "1024x1536",
  "candidates": 4,
  "openai": {
    "model": "gpt-image-2",
    "quality": "high",
    "output_format": "png",
    "background": "opaque",
    "seed": null,
    "negativeMode": "fold",
    "styleRef": "image_refs",
    "styleRefNote": "match the rendering style, lighting and palette of the reference image; new creature described in the prompt"
  },
  "fal": {
    "model": "fal-ai/flux/dev",
    "image_size": "square_hd",
    "guidance_scale": 3.5,
    "num_inference_steps": 28,
    "seed": 42,
    "negativeMode": "param",
    "styleRef": "redux",
    "image_prompt_strength": 0.18,
    "styleRefNote": "ref controls STYLE not SHAPE; seed reproducibility breaks once an image ref is attached (non-deterministic vision embedding)"
  },
  "codex": {
    "model": "gpt-image-2",
    "negativeMode": "fold",
    "seed": null,
    "background": "opaque",
    "note": "conversational/no-seed path; good for the noob loop, not batch determinism"
  }
} as const;

/** Compose a generation prompt — mirrors DESIGN.md assetgen.promptTemplate. */
export function buildPrompt(opts: { prompt: string; game: string; kind: string }): string {
  const framing = GAME_FRAMING[opts.game] ?? GAME_FRAMING.shared;
  const kind = KIND_MAP[opts.kind] ?? opts.kind;
  const scourge = SCOURGE_RULE.pattern.test(opts.prompt) ? SCOURGE_RULE.clause : "";
  const parts = [opts.prompt, kind, framing, STYLE_SUFFIX];
  if (scourge) parts.push(scourge);
  return parts.join(". ") + ".";
}
