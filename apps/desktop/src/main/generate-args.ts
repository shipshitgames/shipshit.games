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
  if ((kind === "model" || kind === "3d") && target.assetsDir) {
    args.push("--assets-dir", String(target.assetsDir));
  }
  if (opts?.views) args.push("--views", String(opts.views));
  if (opts?.frames) args.push("--frames", String(opts.frames));
  if (opts?.fps) args.push("--fps", String(opts.fps));
  if (opts?.anchor) args.push("--anchor", String(opts.anchor));
  if (opts?.scale) args.push("--scale", String(opts.scale));
  if (opts?.license) args.push("--license", String(opts.license));
  if (opts?.licenseUrl) args.push("--license-url", String(opts.licenseUrl));
  // Audio flags (issue #21): only pushed when present so sprite arrays stay
  // byte-identical to pre-audio tests.
  if (opts?.category) args.push("--category", String(opts.category));
  if (opts?.volume != null && opts?.volume !== "") args.push("--volume", String(opts.volume));
  if (opts?.loop === true) args.push("--loop");
  if (opts?.loop === false) args.push("--no-loop");
  if (opts?.bitrate) args.push("--bitrate", String(opts.bitrate));
  if (opts?.normalize) args.push("--normalize");
  // Provenance flags (issue #55): only pushed when present so existing arg
  // arrays stay byte-identical; seed of 0 is valid (only null/empty skip).
  if (opts?.seed != null && opts?.seed !== "") args.push("--seed", String(opts.seed));
  if (opts?.authored) args.push("--authored");
  if (opts?.editKind) args.push("--edit-kind", String(opts.editKind));
  // 3D-model flags (issue #20): only pushed when present so other kinds' arg
  // arrays stay byte-identical. Draco is on by default, so emit --no-draco only
  // when explicitly disabled; --ktx2 opts into the encoder-gated texture path.
  if (opts?.ktx2) args.push("--ktx2");
  if (opts?.draco === false) args.push("--no-draco");
  if (opts?.rig) args.push("--rig", String(opts.rig));
  if (opts?.referenceImage) args.push("--reference", String(opts.referenceImage));
  if (opts?.faceCount) args.push("--face-count", String(opts.faceCount));
  if (opts?.pbr === false) args.push("--no-pbr");
  if (opts?.generateType) args.push("--generate-type", String(opts.generateType));
  if (opts?.maxRuntimeMb) args.push("--max-runtime-mb", String(opts.maxRuntimeMb));
  // --model stays last so existing slice(-2) assertions hold.
  if (model) args.push("--model", String(model));
  return { args, provider, game, kind, repo, model };
}

export { buildGenerateArgs };
