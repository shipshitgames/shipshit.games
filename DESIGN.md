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
  warline:
    camera: "map-first SVG/strategy interface with compact faction icons"
    read: "regions, lanes, breaches, pressure, and faction control visible at a glance"
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
