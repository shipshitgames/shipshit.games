// Pure assembly of the assetgen CLI argv for studio:generate, kept free of
// electron imports so the spawn contract can be unit-tested under bun test.
import { providerForKind } from "./settings";

function buildGenerateArgs({ assetgenPath, settings, opts = {}, target = {} }: any) {
  const game = target.slug || opts?.game || settings.defaultGame;
  const kind = opts?.kind || "sprite";
  const provider = providerForKind(settings, kind, opts?.provider);
  const repo = target.repoPath;
  // Explicit model wins; otherwise only fal pulls the per-kind default from
  // settings — other providers never inherit a model from falModelDefaults.
  const model = opts?.model || (provider === "fal" ? settings.falModelDefaults?.[kind] : "") || "";
  const args = [assetgenPath, "--provider", provider, "--game", game, "--kind", kind, "--id", opts?.id || "asset", "--prompt", opts?.prompt || "", "--repo", repo];
  if (opts?.views) args.push("--views", String(opts.views));
  if (opts?.frames) args.push("--frames", String(opts.frames));
  if (opts?.fps) args.push("--fps", String(opts.fps));
  if (opts?.anchor) args.push("--anchor", String(opts.anchor));
  if (opts?.scale) args.push("--scale", String(opts.scale));
  if (opts?.license) args.push("--license", String(opts.license));
  if (opts?.licenseUrl) args.push("--license-url", String(opts.licenseUrl));
  if (model) args.push("--model", String(model));
  return { args, provider, game, kind, repo, model };
}

export { buildGenerateArgs };
