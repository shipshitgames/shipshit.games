/* GENERATED FROM lore/DESIGN.md v0.1.0 hash:73277f2a - DO NOT EDIT. Run: bun assetgen tokens */
// Asset-generation style, compiled from DESIGN.md frontmatter.
// style.ts re-exports these; edit the design source, not this file.

export const STYLE_SUFFIX = "high-detail PIXEL ART game asset on a visible chunky pixel grid (medium chunky, roughly a 110px-tall sprite when the asset is a sprite), bold hand-placed pixels with hard crisp edges and NO anti-aliasing, ordered dithered shading, silhouette-first readable shape with a subtle dark outline, heavy materials made from blackened iron, gunmetal, burnt bone, ash, rust, clotted blood, cracked stone, torn cloth, parasite-chitin, ruptured flesh, and old machine grafts, one readable low hellfire key or rim light from one side (hellfire #ff6a00 into blood-hot #ff2a18) with fuller flatter sprite lighting so cutouts do not collapse into speckle, fixed limited DOOM palette of #0a0a0a/#121214/#34343c bodies with #c1121f/#a35a33 grime and #e9e3d6 highlights, toxic #8bdc1f only for Scourge infection, breach cores, parasite nodes, and host takeover, premium modern pixel-art (Blasphemous, Dead Cells) crossed with remastered 1990s DOOM sprites, detailed but not noisy, no neon, no text, no watermark, no UI unless the requested asset is UI, single subject unless the prompt requests a tile or interface set, near-black background for previews, it MUST read as chunky pixel art made of visible square pixels, NOT a smooth 3D render, NOT photorealistic, NOT anti-aliased, NOT painted concept art";

export const PALETTE_LINE = "void, coal, gunmetal, blood, rust, bone, hellfire; toxic only for Scourge assets";

export const ART_BIBLE = {
  "materialGrammar": [
    "blackened iron, gunmetal plating, burnt bone, ash, rust, clotted blood, cracked stone, torn cloth, parasite-chitin, ruptured flesh, and old machine grafts",
    "materials should feel heavy, abraded, and production-ready; avoid glossy plastic, clean chrome, jewel tones, or smooth fantasy armor",
    "Scourge material always shows takeover: invasive seams, tendrils, breach cores, chitin over stolen host matter, and growths consuming flesh, bone, metal, or mycelium"
  ],
  "lightingGrammar": [
    "one readable low hellfire key or rim light, not cinematic void-only spotlighting",
    "sprites need flatter fuller light than hero plates so pixel cutouts do not collapse into speckle",
    "UI and texture work should use practical ember highlights and hard contrast, not soft neon bloom"
  ],
  "silhouetteGrammar": [
    "silhouette first: one readable primary mass, one to three distinctive protrusions, and clear negative space around limbs, barrels, wings, or tendrils",
    "prefer squat, brutal, industrial proportions over elegant, pretty, superhero, or chibi anatomy",
    "small-game assets must still read by role before detail: enemy, pickup, projectile, weapon, tile, HUD state, or cover subject"
  ]
} as const;

export const ASSET_TYPE_DIRECTION: Record<string, string> = {
  "sprite": "full subject visible, strong outline, stable transparent cutout, flatter fuller lighting, readable from gameplay distance",
  "texture": "tileable hard-edged material sample with no focal character, no horizon, and no painted concept-scene lighting",
  "ui": "hard industrial HUD chrome, bone text, blood/hellfire action states, toxic green only for Scourge infection state",
  "fx": "short-lived readable impact shape with hellfire, blood, smoke, or Scourge toxic bio-glow; no cyan/magenta sci-fi bloom",
  "cover": "hero plate may be moodier than sprites, but still uses the same palette, parasite grammar, and pixel-fidelity cues"
};

export const REFERENCE_SLOTS: Record<string, string> = {
  "style": "lore/Art/style-refs/{game}.webp - rendering style, palette, pixel grid, and lighting only",
  "silhouette": "lore/Art/silhouettes/{game}/{id}.webp - approved role shape when a specific enemy, weapon, pickup, or unit must stay consistent",
  "palette": "lore/Art/grade/doom.gpl - fixed DOOM ramp for pixelize and palette-lock checks",
  "source": "validated input image for edits or expansions; do not invent a replacement reference when a reviewed source exists"
};

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
  "scourge-survivors": "first-person game billboard sprite, full body, readable at FPS combat distance, front/side/back views when requested",
  "deadlane": "top-down or high-angle lane-defense sprite, silhouette readable from above",
  "pactfall": "isometric 3/4-view champion sprite, MOBA-scale ability silhouette",
  "starblight": "side-on or top-down arcade space-shooter sprite, crisp readable silhouette against void",
  "redline": "side-on runner sprite, profile silhouette readable at courier-lane speed",
  "rothulk": "side-on platformer sprite, profile silhouette, clear traversal pose",
  "shared": "game asset"
};

export const KIND_MAP: Record<string, string> = {
  "texture": "seamless tileable texture",
  "sprite": "game sprite",
  "ui": "HUD or interface element",
  "icon": "inventory or tool icon",
  "fx": "effect sprite",
  "projectile": "projectile or muzzle-flash sprite",
  "pickup": "pickup sprite",
  "cover": "website or game cover plate",
  "map": "map tile or encounter layout"
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
    "styleRefNote": "match rendering style, lighting, palette, and pixel fidelity from the reference image; generate the new subject described in the prompt"
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
    "styleRefNote": "reference controls style, palette, and lighting only; prompt controls the new subject"
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
  const assetDirection = ASSET_TYPE_DIRECTION[opts.kind] ?? "";
  const scourge = SCOURGE_RULE.pattern.test(opts.prompt) ? SCOURGE_RULE.clause : "";
  const parts = [opts.prompt, kind, framing, assetDirection, STYLE_SUFFIX].filter(Boolean);
  if (scourge) parts.push(scourge);
  return parts.join(". ") + ".";
}
