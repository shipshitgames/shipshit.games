/* GENERATED FROM lore/DESIGN.md v0.1.0 hash:85d5b7fb — DO NOT EDIT. Run: bun assetgen tokens */
// Asset-generation style, compiled from the DESIGN.md `assetgen:` block + the
// lore Style-Bible. style.ts re-exports these; edit the bible, not this file.

export const STYLE_SUFFIX = "hi-fi stylized dark-fantasy creature concept render, rendered 3D sculpt look with painterly grime, exaggerated readable silhouette, single full-body subject centered and grounded, hard hellfire rim-light raking from one low side (hellfire #ff6a00 falling to blood-hot #ff2a18), deep crushed near-black shadow on the far side, internal emissive hellfire glow from mouth, eyes and open wounds, near-monochrome warm DOOM grade of #0a0a0a/#121214/#1e1e22/#34343c body with #c1121f/#8a4b2a grime and #e9e3d6 highlights, high contrast, heavy shadows, dirty not pretty, NO neon, no text, no logo, no watermark, no UI, no background scenery, single subject only, near-black void background";

export const NEGATIVE_PROMPTS: string[] = [
  "photorealistic",
  "photographic skin",
  "shallow depth of field",
  "lens bokeh",
  "pixel art",
  "flat 2D vector illustration",
  "cel-shaded cartoon",
  "anime",
  "cute",
  "chibi",
  "slender elegant graceful proportions",
  "symmetrical pretty anatomy",
  "humanoid fantasy knight in clean plate armor",
  "medieval robes capes or swords",
  "clean minimal sci-fi",
  "superhero proportions",
  "soft diffuse even lighting",
  "bright daylight",
  "high-key flat lighting",
  "glossy beauty render",
  "pastel colors",
  "rainbow saturation",
  "cool blue or teal grade",
  "magenta cyan or any neon glow",
  "clean white background",
  "background scenery or landscape",
  "floor plane or ground shadow",
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
  "hardRemap": false,
  "targetPalette": "doom",
  "method": "lut",
  "lutPath": "lore/Art/grade/doom.cube",
  "temperature": 0.18,
  "valueContrast": 0.22,
  "saturation": -0.3,
  "preserveEmissive": true,
  "blackPoint": "#0a0a0a",
  "cutout": {
    "tool": "rembg",
    "model": "isnet-anime",
    "order": "after-generate-before-grade"
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
