// The studio:models IPC payload, kept pure (no electron import) so bun test can
// pin the contract the renderer's per-kind pickers read — model catalogs plus the
// canonical kind→provider routing. The renderer consumes these exact field names
// (fal / defaultProviderByKind / falImageKinds) instead of hand-copied tables that
// had drifted (#194); index.ts just hands this straight to ipcMain.handle.
//
// Same bundle-safe, direct-from-TS-source import shape index.ts uses for fal.ts /
// manifest.ts — no sharp/node-pty/codex in this chain.
import { FAL_IMAGE_KINDS, FAL_MODELS } from "../../../../packages/assetgen/src/fal.ts";
import { DEFAULT_PROVIDER_BY_KIND } from "../../../../packages/assetgen/src/provider-catalog.ts";

export function studioModelsPayload() {
  return {
    fal: FAL_MODELS,
    defaultProviderByKind: DEFAULT_PROVIDER_BY_KIND,
    falImageKinds: [...FAL_IMAGE_KINDS],
  };
}
