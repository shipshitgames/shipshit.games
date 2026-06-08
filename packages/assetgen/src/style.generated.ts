/* GENERATED FROM lore/DESIGN.md v0.1.0 hash:54852bb7 - DO NOT EDIT. Run: bun assetgen tokens */
// Asset-generation style, compiled from DESIGN.md frontmatter.
// style.ts re-exports these; edit the design source, not this file.

export const STYLE_SUFFIX = "high-detail medium-chunky pixel art, game sprite on a visible chunky pixel grid, roughly 110px tall, visible square pixels, hard edges, no anti-aliasing, ordered dithering, subtle dark outline, hellfire rim light, fixed limited DOOM palette of void, coal, gunmetal, blood, rust, bone, hellfire; toxic only for Scourge assets, Blasphemous, Dead Cells, remastered 1990s DOOM sprites, detailed but not noisy, NO neon, no text, no watermark, no UI, single subject only, near-black background, must read as chunky pixel art made of visible square pixels, NOT a smooth 3D render, NOT photorealistic, NOT anti-aliased, NOT painted concept art";

export const PALETTE_LINE = "void, coal, gunmetal, blood, rust, bone, hellfire; toxic only for Scourge assets";

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
  "scourge-survivors": "first-person billboard sprites, front-facing full-body enemies and pickups; readable at FPS combat distance, parasite silhouettes, hot breach targets",
  "deadlane": "top-down / high-angle lane-defense sprites; units and towers readable from above with strong lane silhouettes",
  "pactfall": "isometric 3/4-view champion sprites; MOBA-scale heroes, ability silhouettes, faction identity at small size",
  "starblight": "side-on / top-down arcade space-shooter sprites; ships, projectiles, and orbital threats readable at speed against void",
  "redline": "side-on runner sprites; profile silhouettes readable at courier-lane speed",
  "rothulk": "side-on platformer sprites; chunky poses, traversal hazards, and Scourge bio-ship silhouettes",
  "shared": "medium-chunky high-detail pixel art for generated game assets; nearest-neighbor scaling, lossless hard edges, ordered dithering, no anti-aliasing; void/coal/gunmetal bodies, blood/rust grime, bone highlights, hellfire rim light"
};

export const KIND_MAP: Record<string, string> = {
  "texture": "seamless tileable texture"
};

export const SCOURGE_RULE = { pattern: /\bscourge\b/i, clause: "Scourge subjects must read as host-dependent parasite takeover: overwritten host material, ruptures, tendrils, embedded toxic-green (#8bdc1f) breach cores, black chitin over stolen bone or metal, and invasive growth; vary host family among flesh, chitin, mycelial, machine-graft, bone-titan, or voidship; never a standalone generic demon or alien" };

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

/** Compose a generation prompt from the subject, asset kind, game framing, and design suffix. */
export function buildPrompt(opts: { prompt: string; game: string; kind: string }): string {
  const framing = GAME_FRAMING[opts.game] ?? GAME_FRAMING.shared;
  const kind = KIND_MAP[opts.kind] ?? opts.kind;
  const scourge = SCOURGE_RULE.pattern.test(opts.prompt) ? SCOURGE_RULE.clause : "";
  const parts = [opts.prompt, kind, framing, STYLE_SUFFIX];
  if (scourge) parts.push(scourge);
  return parts.join(". ") + ".";
}
