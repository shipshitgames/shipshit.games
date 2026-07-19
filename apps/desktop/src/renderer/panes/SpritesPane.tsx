import { useState } from "react";

import type { GenResult } from "../../shared/ipc";
import { EmptyTile, GameField, LogView, NumField, ProjectManifestNote, SelectField, TextAreaField, TextField } from "../components/ui";
import { usePatchState, useProjectSelection, useStreamLog } from "../lib/hooks";
import { errorMessage } from "../lib/studio";
import { PixelizePanel } from "./PixelizePanel";

export function SpritesPane() {
  const [form, patch] = usePatchState({
    id: "swarm-husk",
    prompt: "a rotting bio-husk of the Scourge, mid-lunge, gore",
    provider: "codex",
    falModel: "",
    views: "front,side,back",
    frames: 1,
    fps: 8,
    scale: 1,
    license: "ai-generated; review before shipping",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [log, setLog] = useStreamLog(window.studio?.onGenLog);
  const selection = useProjectSelection((settings) => {
    patch({
      provider: settings.providerDefaults.sprite || settings.defaultProvider,
      falModel: settings.falModelDefaults.sprite || "",
    });
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
        kind: "sprite",
        provider: form.provider,
        views: form.views,
        frames: form.frames,
        fps: form.fps,
        anchor: "0.5,1",
        scale: form.scale,
        license: form.license,
      }));
    } catch (e) {
      setLog(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gen">
      <div className="gen-form">
        <TextField label="Asset ID" value={form.id} onChange={(id) => patch({ id })} placeholder="swarm-husk" />
        <TextAreaField label="Prompt" grow value={form.prompt} onChange={(prompt) => patch({ prompt })} />
        <GameField selection={selection} />
        <div className="gen-row">
          <SelectField label="Views" value={form.views} onChange={(views) => patch({ views })}>
            <option value="front">front</option>
            <option value="front,side,back">front / side / back</option>
            <option value="front,three-quarter,side,back">4-way billboard</option>
            <option value="front,front-right,right,back-right,back,back-left,left,front-left">8-way billboard</option>
          </SelectField>
          <NumField label="Frames" min={1} max={16} fallback={1} value={form.frames} onChange={(frames) => patch({ frames })} />
        </div>
        <div className="gen-row">
          <NumField label="FPS" min={1} max={30} fallback={8} value={form.fps} onChange={(fps) => patch({ fps })} />
          <NumField label="World scale" min={0.1} max={20} step={0.1} fallback={1} value={form.scale} onChange={(scale) => patch({ scale })} />
        </div>
        <TextField label="License record" value={form.license} onChange={(license) => patch({ license })} />
        <div className="hint">sprite provider <b>{form.provider}</b>{form.provider === "fal" && <> · model <b>{form.falModel || "flux dev default"}</b></>} · change in Settings (topbar gear)</div>
        <ProjectManifestNote project={selectedProject} />
        <button className="btn btn-primary" type="button" disabled={busy || !form.id || !form.prompt || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
          {busy ? "Forging…" : "Generate"}
        </button>
        <p className="note">Auto-styled with the DOOM DESIGN.md suffix · writes the .webp + updates the game's assets.json. Codex runs take a minute — watch the log.</p>
      </div>
      <div className="gen-preview">
        {result?.dataUrl ? (
          <div className="billboard-stage">
            <div className="billboard-floor" />
            <img className="billboard-sprite" src={result.dataUrl} alt={form.id} />
          </div>
        ) : <EmptyTile>{busy ? "forging…" : "preview"}</EmptyTile>}
        {(log || result) && <LogView err={!!result && !result.ok}>{log || "—"}</LogView>}
        {result?.path && <div className="path">{result.path}</div>}
        {result?.previewPath && <div className="path">{result.previewPath}</div>}
        {result?.ok && result.dataUrl && <PixelizePanel key={result.dataUrl} source={{ dataUrl: result.dataUrl, path: result.path }} />}
      </div>
    </div>
  );
}
