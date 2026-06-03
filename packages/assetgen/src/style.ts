// DOOM style canon — mirrors lore/DESIGN.md. Every generated asset carries this.
export const DOOM_SUFFIX =
  "dark, gritty, DOOM-like, blood and rust and gunmetal, hellfire ember light, " +
  "grimy industrial, high contrast, heavy shadows, NO neon, no text, " +
  "centered, transparent background";

// Per-game framing — the same canon entity rendered for each game's camera.
export const GAME_FRAMING: Record<string, string> = {
  "scourge-survivors": "first-person game billboard sprite, front-facing, full body",
  deadlane: "top-down / high-angle game sprite, silhouette readable from above",
  pactfall: "isometric 3/4-view game sprite, champion scale",
  starblight: "side-on / top-down arcade space-shooter sprite, crisp readable silhouette",
  shared: "game asset",
};

export function buildPrompt(opts: { prompt: string; game: string; kind: string }): string {
  const framing = GAME_FRAMING[opts.game] ?? GAME_FRAMING.shared;
  const kind = opts.kind === "texture" ? "seamless tileable texture" : opts.kind;
  const scourgeRule = /\bscourge\b/i.test(opts.prompt)
    ? "Scourge subjects must read as one parasite army wearing conquered host races: ruptured host flesh, invasive tendrils, embedded breach cores, black chitin over stolen bone/metal, fused wreckage or machinery; host family can vary between flesh, chitin, fungal, machine-graft, bone titan, or voidship, but avoid standalone generic demon or alien designs"
    : "";
  return `${opts.prompt}. ${kind}. ${framing}. ${DOOM_SUFFIX}${scourgeRule ? `. ${scourgeRule}` : ""}.`;
}
