// Pure prompt helpers for sprite generation. Kept free of sharp/node-pty so
// API consumers (apps/api) can import them without dragging native deps into
// their serverless bundles. sprites.ts re-exports these for older imports.

export function spritePromptDirective(views: string[], frameCount: number): string {
  const cleanViews = views.length ? views : ["front"];
  if (frameCount > 1 && cleanViews.length > 1) {
    return [
      `Sprite sheet layout: ${cleanViews.length} rows named ${cleanViews.join(", ")} from top to bottom`,
      `${frameCount} animation frames per row from left to right`,
      "transparent or near-black background, equal cell spacing, no labels",
    ].join("; ");
  }
  if (frameCount > 1) {
    return [
      `Sprite animation sheet: ${frameCount} frames in one horizontal row`,
      "transparent or near-black background, equal cell spacing, no labels",
    ].join("; ");
  }
  if (cleanViews.length > 1) {
    return [
      `Multi-view sprite sheet: ${cleanViews.join(", ")} views in one horizontal row from left to right`,
      "transparent or near-black background, equal cell spacing, no labels",
    ].join("; ");
  }
  return "Single transparent billboard sprite, full body, centered in frame";
}
