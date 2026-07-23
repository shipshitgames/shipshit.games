---
version: "0.1.0"
name: "Ship Shit Games"
description: >-
  Studio-side visual identity for shipshit.games: a brutal public game-studio
  cockpit, built from black metal, ember light, bone text, blood-red actions,
  and medium-chunky DOOM-grade pixel art.
colors:
  primary: "#c1121f"
  onPrimary: "#f4efe6"
  secondary: "#ff6a00"
  onSecondary: "#0a0a0a"
  tertiary: "#8bdc1f"
  neutral: "#0a0a0a"
  void: "#0a0a0a"
  coal: "#121214"
  iron: "#1e1e22"
  gunmetal: "#34343c"
  blood: "#c1121f"
  bloodHot: "#ff2a18"
  hellfire: "#ff6a00"
  rust: "#a35a33"
  bone: "#e9e3d6"
  ash: "#9b958a"
  toxic: "#8bdc1f"
typography:
  display:
    fontFamily: "Oswald, 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  label:
    fontFamily: "Oswald, 'Arial Narrow', 'Helvetica Neue', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
elevation:
  flat: "none"
  ember: "0 0 0 1px rgba(255,106,0,0.35), 0 0 26px -6px rgba(193,18,31,0.65)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.onPrimary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.onSecondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  status-scourge:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.coal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.sm}"
    padding: "24px"
  panel-raised:
    backgroundColor: "{colors.iron}"
    textColor: "{colors.bone}"
    rounded: "{rounded.sm}"
    padding: "16px"
  panel-metal:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.none}"
    padding: "16px"
  terminal:
    backgroundColor: "{colors.void}"
    textColor: "{colors.ash}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "16px"
  badge-blood:
    backgroundColor: "{colors.blood}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-hot:
    backgroundColor: "{colors.bloodHot}"
    textColor: "{colors.neutral}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-hellfire:
    backgroundColor: "{colors.hellfire}"
    textColor: "{colors.onSecondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-rust:
    backgroundColor: "{colors.rust}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-toxic:
    backgroundColor: "{colors.toxic}"
    textColor: "{colors.neutral}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
pixelArt:
  medium: "high-detail medium-chunky pixel art"
  gridHeight: "110px"
  rendering: "visible square pixels, hard edges, no anti-aliasing"
  shading: "ordered dithering, subtle dark outline, hellfire rim light"
  palette: "void, coal, gunmetal, blood, rust, bone, hellfire; toxic only for Scourge assets"
  references: "Blasphemous, Dead Cells, remastered 1990s DOOM sprites"
gameArtDirection:
  shared:
    medium: "medium-chunky high-detail pixel art for generated game assets"
    renderRules: "nearest-neighbor scaling, lossless hard edges, ordered dithering, no anti-aliasing"
    paletteRules: "void/coal/gunmetal bodies, blood/rust grime, bone highlights, hellfire rim light"
  scourge-survivors:
    camera: "first-person billboard sprites, front-facing full-body enemies and pickups"
    read: "readable at FPS combat distance, parasite silhouettes, hot breach targets"
  deadlane:
    camera: "top-down / high-angle lane-defense sprites"
    read: "units and towers readable from above with strong lane silhouettes"
  pactfall:
    camera: "isometric 3/4-view champion sprites"
    read: "MOBA-scale heroes, ability silhouettes, faction identity at small size"
  starblight:
    camera: "side-on / top-down arcade space-shooter sprites"
    read: "ships, projectiles, and orbital threats readable at speed against void"
  redline:
    camera: "side-on runner sprites"
    read: "profile silhouettes readable at courier-lane speed"
  rothulk:
    camera: "side-on platformer sprites"
    read: "chunky poses, traversal hazards, and Scourge bio-ship silhouettes"
artBible:
  materialGrammar:
    - "blackened iron, gunmetal plating, burnt bone, ash, rust, clotted blood, cracked stone, torn cloth, parasite-chitin, ruptured flesh, and old machine grafts"
    - "materials should feel heavy, abraded, and production-ready; avoid glossy plastic, clean chrome, jewel tones, or smooth fantasy armor"
    - "Scourge material always shows takeover: invasive seams, tendrils, breach cores, chitin over stolen host matter, and growths consuming flesh, bone, metal, or mycelium"
  lightingGrammar:
    - "one readable low hellfire key or rim light, not cinematic void-only spotlighting"
    - "sprites need flatter fuller light than hero plates so pixel cutouts do not collapse into speckle"
    - "UI and texture work should use practical ember highlights and hard contrast, not soft neon bloom"
  silhouetteGrammar:
    - "silhouette first: one readable primary mass, one to three distinctive protrusions, and clear negative space around limbs, barrels, wings, or tendrils"
    - "prefer squat, brutal, industrial proportions over elegant, pretty, superhero, or chibi anatomy"
    - "small-game assets must still read by role before detail: enemy, pickup, projectile, weapon, tile, HUD state, or cover subject"
  assetTypeDirection:
    sprite: "full subject visible, strong outline, stable transparent cutout, flatter fuller lighting, readable from gameplay distance"
    texture: "tileable hard-edged material sample with no focal character, no horizon, and no painted concept-scene lighting"
    ui: "hard industrial HUD chrome, bone text, blood/hellfire action states, toxic green only for Scourge infection state"
    fx: "short-lived readable impact shape with hellfire, blood, smoke, or Scourge toxic bio-glow; no cyan/magenta sci-fi bloom"
    cover: "hero plate may be moodier than sprites, but still uses the same palette, parasite grammar, and pixel-fidelity cues"
  negativePromptSet:
    - "smooth 3D render"
    - "rendered 3D model"
    - "photorealistic"
    - "photographic"
    - "anti-aliased smooth edges"
    - "airbrushed"
    - "painted concept art"
    - "blurry"
    - "hi-fi render"
    - "cel-shaded cartoon"
    - "anime"
    - "cute"
    - "chibi"
    - "slender elegant graceful proportions"
    - "symmetrical pretty anatomy"
    - "clean plate-armor fantasy knight"
    - "medieval robes capes or swords"
    - "clean minimal sci-fi"
    - "superhero proportions"
    - "soft diffuse even lighting"
    - "bright daylight"
    - "pastel colors"
    - "rainbow saturation"
    - "cool blue or teal grade"
    - "magenta cyan or any neon glow"
    - "clean white background"
    - "background scenery or landscape"
    - "multiple characters"
    - "text watermark or logo"
    - "UI frames or HUD"
    - "cropped or close-up framing that hides the silhouette"
  referenceSlots:
    style: "lore/Art/style-refs/{game}.webp - rendering style, palette, pixel grid, and lighting only"
    silhouette: "lore/Art/silhouettes/{game}/{id}.webp - approved role shape when a specific enemy, weapon, pickup, or unit must stay consistent"
    palette: "lore/Art/grade/doom.gpl - fixed DOOM ramp for pixelize and palette-lock checks"
    source: "validated input image for edits or expansions; do not invent a replacement reference when a reviewed source exists"
assetgen:
  styleSuffix: >-
    high-detail PIXEL ART game asset on a visible chunky pixel grid (medium chunky,
    roughly a 110px-tall sprite when the asset is a sprite), bold hand-placed
    pixels with hard crisp edges and NO anti-aliasing, ordered dithered shading,
    silhouette-first readable shape with a subtle dark outline, heavy materials
    made from blackened iron, gunmetal, burnt bone, ash, rust, clotted blood,
    cracked stone, torn cloth, parasite-chitin, ruptured flesh, and old machine
    grafts, one readable low hellfire key or rim light from one side (hellfire
    {colors.hellfire} into blood-hot {colors.bloodHot}) with fuller flatter
    sprite lighting so cutouts do not collapse into speckle, fixed limited DOOM
    palette of {colors.void}/{colors.coal}/{colors.gunmetal} bodies with
    {colors.blood}/{colors.rust} grime and {colors.bone} highlights, toxic
    {colors.toxic} only for Scourge infection, breach cores, parasite nodes, and
    host takeover, premium modern pixel-art (Blasphemous, Dead Cells) crossed
    with remastered 1990s DOOM sprites, detailed but not noisy, no neon, no
    text, no watermark, no UI unless the requested asset is UI, single subject
    unless the prompt requests a tile or interface set, near-black background
    for previews, it MUST read as chunky pixel art made of visible square pixels,
    NOT a smooth 3D render, NOT photorealistic, NOT anti-aliased, NOT painted
    concept art
  negativePrompts:
    - "smooth 3D render"
    - "rendered 3D model"
    - "photorealistic"
    - "photographic"
    - "anti-aliased smooth edges"
    - "airbrushed"
    - "painted concept art"
    - "blurry"
    - "hi-fi render"
    - "cel-shaded cartoon"
    - "anime"
    - "cute"
    - "chibi"
    - "slender elegant graceful proportions"
    - "symmetrical pretty anatomy"
    - "clean plate-armor fantasy knight"
    - "medieval robes capes or swords"
    - "clean minimal sci-fi"
    - "superhero proportions"
    - "soft diffuse even lighting"
    - "bright daylight"
    - "pastel colors"
    - "rainbow saturation"
    - "cool blue or teal grade"
    - "magenta cyan or any neon glow"
    - "clean white background"
    - "background scenery or landscape"
    - "multiple characters"
    - "text watermark or logo"
    - "UI frames or HUD"
    - "cropped or close-up framing that hides the silhouette"
  perGameFraming:
    scourge-survivors: "first-person game billboard sprite, full body, readable at FPS combat distance, front/side/back views when requested"
    deadlane: "top-down or high-angle lane-defense sprite, silhouette readable from above"
    pactfall: "isometric 3/4-view champion sprite, MOBA-scale ability silhouette"
    starblight: "side-on or top-down arcade space-shooter sprite, crisp readable silhouette against void"
    redline: "side-on runner sprite, profile silhouette readable at courier-lane speed"
    rothulk: "side-on platformer sprite, profile silhouette, clear traversal pose"
    shared: "game asset"
  kindMap:
    texture: "seamless tileable texture"
    sprite: "game sprite"
    ui: "HUD or interface element"
    icon: "inventory or tool icon"
    fx: "effect sprite"
    projectile: "projectile or muzzle-flash sprite"
    pickup: "pickup sprite"
    cover: "website or game cover plate"
    map: "map tile or encounter layout"
  assetTypeDirection:
    sprite: "full subject visible, transparent-cutout ready, strong outline, flatter fuller lighting than hero art, readable from gameplay distance"
    texture: "tileable material sample, no character, no horizon, no scene depth, hard pixel edges and repeat-safe grime"
    ui: "hard industrial HUD chrome, bone text space, blood and hellfire states, toxic green only for Scourge infection or breach telemetry"
    icon: "centered object silhouette, no text, simple readable material contrast, transparent-cutout ready"
    fx: "compact animated impact shape, readable in 50-120ms, hellfire/blood/smoke or Scourge toxic bio-glow only when canon allows"
    projectile: "small high-contrast projectile silhouette with visible travel direction and no background scene"
    pickup: "readable collectible silhouette with one clear gameplay affordance and no decorative scenery"
    cover: "single hero subject or faction tableau, moodier than sprites but still palette-locked and pixel-forward"
    map: "topology-first layout, clear lanes/chokepoints/cover, material palette locked to game faction and biome"
  referenceSlots:
    style: "lore/Art/style-refs/{game}.webp"
    silhouette: "lore/Art/silhouettes/{game}/{id}.webp"
    palette: "lore/Art/grade/doom.gpl"
    source: "validated source image supplied for this generation or edit"
  referenceImages:
    scourge-survivors: "lore/Art/style-refs/scourge-survivors.webp"
    deadlane: "lore/Art/style-refs/deadlane.webp"
    pactfall: "lore/Art/style-refs/pactfall.webp"
    starblight: "lore/Art/style-refs/starblight.webp"
    redline: "lore/Art/style-refs/redline.webp"
    rothulk: "lore/Art/style-refs/rothulk.webp"
    shared: "lore/Art/style-refs/scourge-survivors.webp"
  scourgeRule:
    trigger: "\\bscourge\\b"
    flags: "i"
    clause: >-
      Scourge subjects must read as one parasite army wearing conquered host
      races: ruptured host flesh, invasive tendrils, embedded toxic-green
      ({colors.toxic}) breach cores, black chitin over stolen bone/metal, fused
      wreckage or machinery; vary host family among flesh, chitin, mycelial,
      machine-graft, bone-titan, or voidship; never a standalone generic demon
      or alien; if it lacks this grammar it is only a monster, not the Scourge
  gradeParams:
    pixelGrid: 110
    downscale: "box"
    nearestFilter: true
    dither: "ordered"
    antialias: false
    hardRemap: true
    targetPalette: "doom"
    palettePath: "lore/Art/grade/doom.gpl"
    outline: "subtle-dark"
    preserveEmissive: true
    blackPoint: "{colors.void}"
    encode: "webp-lossless"
    softGrade:
      strength: 0.18
      valueRange: [0.04, 0.9]
      temperatureRange: [0.0, 0.45]
      alphaThreshold: 8
      materialPixelRatio: 0.05
      exampleLimit: 8
    cutout:
      tool: "rembg"
      order: "after-generate-before-downscale"
  providers:
    default: "openai"
    size: "1024x1536"
    candidates: 4
    openai:
      model: "gpt-image-2"
      quality: "high"
      output_format: "png"
      background: "opaque"
      seed: null
      negativeMode: "fold"
      styleRef: "image_refs"
      styleRefNote: "match rendering style, lighting, palette, and pixel fidelity from the reference image; generate the new subject described in the prompt"
    fal:
      model: "fal-ai/flux/dev"
      image_size: "square_hd"
      guidance_scale: 3.5
      num_inference_steps: 28
      seed: 42
      negativeMode: "param"
      styleRef: "redux"
      image_prompt_strength: 0.18
      styleRefNote: "reference controls style, palette, and lighting only; prompt controls the new subject"
    codex:
      model: "gpt-image-2"
      negativeMode: "fold"
      seed: null
      background: "opaque"
      note: "conversational/no-seed path; good for the noob loop, not batch determinism"
---

## Overview

Ship Shit Games is the studio interface for building games with AI in public. It
should feel like a grim production cockpit: practical, hot, metal, and a little
dangerous, but still readable enough for docs, tooling, pricing, CLI pages, and
desktop workflows.

The visual language is shared with DEADROT, but the emphasis is different:
shipshit.games is the maker surface. Use the same brutal palette, but bias UI
toward work surfaces, terminals, agent logs, tool panels, sprite previews, and
public build-in-progress proof.

### Pixel Art Style

Use high-detail medium-chunky pixel art when showing generated game assets,
DEADROT proof, sprites, icons, or pipeline output. The target read is premium
modern pixel art crossed with remastered 1990s DOOM: visible square pixels,
lossless hard edges, ordered dithered shading, readable silhouettes, subtle dark
outlines, and a low hellfire rim-light. Avoid smooth 3D renders, photorealism,
painted concept art, anime, cute/chibi proportions, and neon cyan/magenta glow.

### DOOM Art Bible

Materials should come from black iron, gunmetal, burnt bone, ash, rust, blood,
cracked stone, torn cloth, parasite-chitin, ruptured flesh, and old machine
grafts. Surfaces should feel abraded and heavy rather than glossy, clean, or
decorative.

Lighting should use one practical hellfire key or rim light with hard contrast.
Hero plates can be moodier, but gameplay sprites need fuller and flatter light
so the pixel cutout stays readable after palette locking and alpha cleanup.

Silhouettes come before detail. Every asset should keep one readable primary
mass, a few distinctive protrusions, and clear negative space around limbs,
barrels, wings, blades, or tendrils. At small size, the player should read the
role before the surface detail.

Asset-type direction lives in the `artBible.assetTypeDirection` and
`assetgen.assetTypeDirection` front matter. Sprites prioritize transparent
cutouts and gameplay readability; textures prioritize repeat-safe material;
UI prioritizes industrial HUD chrome; FX prioritizes short-lived impact shapes;
cover plates can be more dramatic while staying palette-locked.

Reference slots are explicit. Use style references for rendering style, lighting,
palette, and pixel fidelity; silhouette references only when a role shape has
already been approved; the DOOM palette file for pixelize grading; and the
validated source image when editing or expanding existing art.

### Game Art Direction

Define art direction per game in the `gameArtDirection` front matter. The shared
medium sets the house look; each game then defines its camera, sprite framing,
and gameplay readability rule. Agents should use the game slug as the override
key and fall back to `shared` when a new prototype has not declared its own
direction yet.

## Colors

| Token | Hex | Use |
|-------|-----|-----|
| `primary` / `blood` | `#c1121f` | primary actions, danger, kill-state emphasis |
| `secondary` / `hellfire` | `#ff6a00` | active highlights, ember accents, focus rings |
| `tertiary` / `toxic` | `#8bdc1f` | Scourge-only bio-glow, never a general studio accent |
| `void` | `#0a0a0a` | page background, terminal background |
| `coal` | `#121214` | panels, cards, muted surfaces |
| `iron` | `#1e1e22` | raised surfaces and secondary controls |
| `gunmetal` | `#34343c` | borders, dividers, industrial chrome |
| `rust` | `#a35a33` | grime, worn metal, muted warmth |
| `bone` | `#e9e3d6` | headings and strong foreground text |
| `ash` | `#9b958a` | body text, captions, secondary metadata |

Rule: red, fire, metal, bone. Toxic-green is reserved for Scourge proof and
asset previews. Avoid neon, pastel, glossy SaaS blue, and clean sci-fi cyan.

## Typography

- **Display:** Oswald 700, uppercase. Use for brand marks, page headings, panel
  titles, HUD labels, and game-title treatments.
- **Body:** Inter 400/500/600. Use for readable marketing copy, docs, forms, and
  product UI.
- **Mono:** system monospace. Use for CLI snippets, terminal panes, logs,
  counters, IDs, build status, and asset-generation metadata.

## Layout

- Studio pages should be dense but readable: constrained content, clear gutters,
  strong section rhythm, and tool-like panels instead of soft marketing cards.
- Product and docs surfaces can use grids, but keep them industrial and direct.
  Prefer hard dividers, compact rows, and scannable labels.
- Asset previews should preserve pixelated rendering with nearest-neighbor
  scaling and stable square/portrait frames.

## Elevation & Depth

Depth comes from contrast, 1px borders, inset shadows, grain, vignette, and
sparingly used ember glow. The `ember` shadow is for hot actions, active build
states, warnings, and selected sprite or game artifacts.

## Shapes

Use hard geometry. `rounded.sm` is the default; `rounded.none` is correct for
HUD chrome, terminal panes, and pixel-art frames. Avoid pills, bubbly corners,
large soft cards, and clean futuristic glass.

## Components

- **button-primary:** blood background, bone text, Oswald label, hard 2px radius.
- **button-secondary:** coal background, hellfire text, hard 2px radius.
- **card:** coal surface, bone title/text, gunmetal border, compact spacing.
- **terminal:** void background, ash mono text, hard border, no decorative glow.
- **asset-preview:** pixelated rendering, dark matte background, stable frame,
  no smoothing or blurred drop shadow.

## Do's and Don'ts

**Do:** use Oswald + Inter; lead with void, blood, hellfire, gunmetal, bone; make
pixel art visibly pixelated; keep studio UI utilitarian; use ember glow only
when something is active, dangerous, selected, or hot.

**Don't:** use magenta/cyan neon, pastel gradients, soft pill controls, glossy
startup styling, smooth 3D asset renders, photorealism, or cute/chibi sprites.
