// Bundle-safe palette contract shared by assetgen's sharp-backed pixelizer and
// the Desktop sprite editor. Keep native/image dependencies out of this module.

// Fixed DOOM ramp (brand tokens + value steps so shading has somewhere to land).
// Toxic green is included but should only appear where the source already glows it.
export const DOOM_RAMP: string[] = [
  "#000000",
  "#0a0a0a",
  "#161214",
  "#241a1a",
  "#34343c",
  "#4a4a52",
  "#6a655e",
  "#8a8278",
  "#b3ab9e",
  "#e9e3d6",
  "#3a0a0e",
  "#7a0f16",
  "#c1121f",
  "#ff2a18",
  "#5a2e18",
  "#8a4b2a",
  "#b06a32",
  "#d98a4a",
  "#a83c00",
  "#ff6a00",
  "#ffa030",
  "#ffce5c",
  "#2c5410",
  "#5a9a18",
  "#8bdc1f",
];

export const PIXELIZE_PALETTES: Record<string, string[]> = {
  doom: DOOM_RAMP,
};

export function resolvePaletteByName(
  name?: string,
): string[] | undefined {
  if (!name) return undefined;
  return PIXELIZE_PALETTES[name.toLowerCase()];
}
