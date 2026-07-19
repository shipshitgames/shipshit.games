import { useState } from "react";

import type { PixelizeResult } from "../../shared/ipc";
import { EmptyTile, NumField, SelectField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

// Pixelize step (#66): after a sprite is generated, re-grade it onto the true DOOM
// pixel grid — rembg/flood-fill cutout → box-downscale to the grid height →
// nearest-quantize to the fixed ramp → lossless webp — and show a before/after.
// Runs the SAME assetgen pixelize() the CLI uses, over studio:pixelize.
const PIXELIZE_CUTOUTS = [
  { id: "auto", label: "auto (rembg → flood)" },
  { id: "rembg", label: "rembg (segmentation)" },
  { id: "flood", label: "flood-fill (near-black)" },
  { id: "none", label: "none" },
];

export function PixelizePanel({ source }: { source: { dataUrl?: string | null; path?: string | null } }) {
  const [form, patch] = usePatchState({ height: 110, bg: 42, cutout: "auto", palette: "doom" });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<PixelizeResult | null>(null);
  const [err, setErr] = useState("");

  // A fresh generation invalidates the previous pixelize output. The parent remounts
  // this panel via `key` on each new source (React's "reset state with a key"), so the
  // before/after never carries over a stale result — no effect, no derived state.
  const hasSource = !!(source.dataUrl || source.path);

  async function run() {
    if (!window.studio?.pixelize) { setErr("studio bridge unavailable — restart the app"); return; }
    if (!hasSource) { setErr("nothing to pixelize — generate a sprite first"); return; }
    setBusy(true);
    setErr("");
    try {
      const result = await window.studio.pixelize({
        dataUrl: source.dataUrl ?? undefined,
        path: source.path ?? undefined,
        height: form.height,
        bgThreshold: form.bg,
        cutout: form.cutout,
        palette: form.palette,
      });
      if (!result.ok) { setErr(result.error || "pixelize failed"); setOut(null); }
      else setOut(result);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pixelize-step">
      <div className="pixelize-head">
        <span className="pixelize-title">Pixelize</span>
        <span className="pixelize-sub">snap to a true DOOM pixel grid</span>
      </div>
      <div className="pixelize-controls">
        <NumField label="Grid height" min={16} max={512} fallback={110} value={form.height} onChange={(height) => patch({ height })} />
        <div className="pixelize-presets">
          <button type="button" className={"btn" + (form.height === 110 ? " is-active" : "")} onClick={() => patch({ height: 110 })}>rank-and-file · 110</button>
          <button type="button" className={"btn" + (form.height === 180 ? " is-active" : "")} onClick={() => patch({ height: 180 })}>boss · 180</button>
        </div>
        <NumField label="BG threshold" min={0} max={255} value={form.bg} onChange={(bg) => patch({ bg })} />
        <SelectField label="Cutout" value={form.cutout} onChange={(cutout) => patch({ cutout })}>
          {PIXELIZE_CUTOUTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <SelectField label="Palette" value={form.palette} onChange={(palette) => patch({ palette })}>
          <option value="doom">DOOM ramp</option>
        </SelectField>
      </div>
      <button className="btn btn-primary" type="button" disabled={busy || !hasSource} onClick={run}>
        {busy ? "Pixelizing…" : "Pixelize"}
      </button>
      {err && <div className="error-text">{err}</div>}
      <div className="pixelize-ba">
        <figure className="pixelize-cell">
          <figcaption>before</figcaption>
          {source.dataUrl
            ? <img className="pixelize-img" src={source.dataUrl} alt="before pixelize" />
            : <EmptyTile>—</EmptyTile>}
        </figure>
        <figure className="pixelize-cell">
          <figcaption>after{out?.cutout?.tool ? ` · ${out.cutout.tool}` : ""}</figcaption>
          {out?.dataUrl
            ? <img className="pixelize-img is-pixelated" src={out.dataUrl} alt="after pixelize" />
            : <EmptyTile>{busy ? "pixelizing…" : "pixelize"}</EmptyTile>}
        </figure>
      </div>
    </div>
  );
}
