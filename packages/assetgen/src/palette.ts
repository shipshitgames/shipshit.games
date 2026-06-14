// palette — emit the in-repo DOOM ramp as a GIMP `.gpl` palette so the SAME colors
// the `pixelize` grid locks to are loadable in Aseprite / LibreSprite. Hand-edits
// (issue #78) then stay on-palette by construction. `pixelize.ts`'s DOOM_RAMP is the
// single source of truth — `packages/assets/palettes/doom.gpl` is GENERATED from it,
// never hand-kept; a drift test regenerates and compares.

export type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Render a hex palette as a GIMP `.gpl` file (the format Aseprite / LibreSprite
 * load via "Palette > Load"). Each swatch is `R G B<TAB><name>`; the hex string is
 * reused as the swatch name so the file doubles as a readable colour list.
 */
export function paletteToGpl(palette: string[], name: string, columns = 8): string {
  const pad = (n: number): string => String(n).padStart(3, " ");
  const lines = ["GIMP Palette", `Name: ${name}`, `Columns: ${columns}`, "#"];
  for (const hex of palette) {
    const [r, g, b] = hexToRgb(hex);
    lines.push(`${pad(r)} ${pad(g)} ${pad(b)}\t${hex}`);
  }
  return lines.join("\n") + "\n";
}
