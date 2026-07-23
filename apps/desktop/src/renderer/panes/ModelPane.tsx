import { useState } from "react";

import type { GenResult } from "../../shared/ipc";
import { ModelPreview } from "../ModelPreview";
import { EmptyTile, GameField, LogView, ProjectManifestNote, SelectField, TextAreaField, TextField } from "../components/ui";
import { usePatchState, useProjectSelection, useStreamLog } from "../lib/hooks";
import { isModelResult } from "../model-preview-config";
import { errorMessage } from "../lib/studio";

// 3D pane (issue #20): drives @shipshitgames/assetgen's model pipeline — provider
// GLB → mandatory gltf-transform optimize (Draco geometry, encoder-gated KTX2 else
// WebP textures) → manifest entry — then previews the optimized GLB in-process with
// the Draco+KTX2-wired three.js loader (ModelPreview).
const MODEL_PROVIDERS = ["replicate", "meshy", "tripo", "mock"];

export function ModelPane() {
  const [form, patch] = usePatchState({
    id: "stone-golem",
    prompt: "a hulking moss-covered stone golem, game-ready, neutral T-pose",
    provider: "replicate",
    referenceImage: "",
    faceCount: "300000",
    pbr: true,
    generateType: "Normal",
    maxRuntimeMb: "20",
    rig: "",
    draco: true,
    ktx2: false,
    license: "ai-generated; review 3D + rig license before shipping",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [log, setLog] = useStreamLog(window.studio?.onGenLog);
  const selection = useProjectSelection((settings) => {
    patch({ provider: settings.providerDefaults.model || settings.providerDefaults["3d"] || "replicate" });
  });
  const { game, selectedProject } = selection;

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.generate({
        id: form.id,
        prompt: form.prompt,
        game: selectedProject?.slug || game,
        projectId: selectedProject?.id,
        kind: "model",
        provider: form.provider,
        draco: form.draco,
        ktx2: form.ktx2,
        rig: form.rig.trim() || undefined,
        referenceImage: form.referenceImage.trim() || undefined,
        faceCount: Number.parseInt(form.faceCount, 10) || undefined,
        pbr: form.pbr,
        generateType: form.generateType as "Normal" | "Geometry",
        maxRuntimeMb: Number.parseFloat(form.maxRuntimeMb) || undefined,
        license: form.license,
      }));
    } catch (e) {
      setLog(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const showPreview = !!result?.dataUrl && isModelResult(result?.mediaType);

  return (
    <div className="gen">
      <div className="gen-form">
        <TextField label="Asset ID" value={form.id} onChange={(id) => patch({ id })} placeholder="stone-golem" />
        <TextAreaField label="Prompt" grow value={form.prompt} onChange={(prompt) => patch({ prompt })} />
        <TextField label="Reference image (optional)" value={form.referenceImage} onChange={(referenceImage) => patch({ referenceImage })} placeholder="/path/to/concept.png" />
        <GameField selection={selection} />
        <div className="gen-row">
          <SelectField label="Provider" value={form.provider} onChange={(provider) => patch({ provider })}>
            {MODEL_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </SelectField>
          <TextField label="Rig source" value={form.rig} onChange={(rig) => patch({ rig })} placeholder="provider default" />
        </div>
        <div className="gen-row">
          <TextField label="Face target" value={form.faceCount} onChange={(faceCount) => patch({ faceCount })} placeholder="300000" />
          <TextField label="Runtime budget (MiB)" value={form.maxRuntimeMb} onChange={(maxRuntimeMb) => patch({ maxRuntimeMb })} placeholder="20" />
          <SelectField label="Generation" value={form.generateType} onChange={(generateType) => patch({ generateType })}>
            <option value="Normal">Textured</option>
            <option value="Geometry">Geometry only</option>
          </SelectField>
        </div>
        <div className="gen-row">
          <label className="check"><input type="checkbox" checked={form.draco} onChange={(e) => patch({ draco: e.target.checked })} /><span>Draco geometry</span></label>
          <label className="check"><input type="checkbox" checked={form.ktx2} onChange={(e) => patch({ ktx2: e.target.checked })} /><span>KTX2 textures (else WebP)</span></label>
          <label className="check"><input type="checkbox" checked={form.pbr} onChange={(e) => patch({ pbr: e.target.checked })} /><span>PBR materials</span></label>
        </div>
        <TextField label="License record" value={form.license} onChange={(license) => patch({ license })} />
        <div className="hint">3D provider <b>{form.provider}</b> · optimize: Draco {form.draco ? "on" : "off"} · textures {form.ktx2 ? "KTX2→WebP fallback" : "WebP"} · change defaults in Settings (topbar gear)</div>
        <ProjectManifestNote project={selectedProject} />
        <button className="btn btn-primary" type="button" disabled={busy || !form.id || (!form.prompt && !form.referenceImage) || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
          {busy ? "Sculpting…" : "Generate"}
        </button>
        <p className="note">Replicate Hunyuan 3D 3.1 is the default and accepts either the prompt or one concept image. Meshy/Tripo remain available. Every result is optimized, budget-checked, and stored with source, prediction, provenance, and license traces.</p>
      </div>
      <div className="gen-preview">
        {showPreview ? (
          <ModelPreview src={result!.dataUrl!} label={form.id} />
        ) : <EmptyTile>{busy ? "sculpting…" : "preview"}</EmptyTile>}
        {(log || result) && <LogView err={!!result && !result.ok}>{log || "—"}</LogView>}
        {result?.path && <div className="path">{result.path}</div>}
      </div>
    </div>
  );
}
