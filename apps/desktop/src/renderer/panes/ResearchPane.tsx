import { useState } from "react";

import type { ResearchResult } from "../../shared/ipc";
import { EmptyTile, LogView, SelectField, TextField } from "../components/ui";
import { usePatchState, useStreamLog } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

function slugFromUrl(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1].toLowerCase() : "ruleset";
}

export function ResearchPane() {
  // Ressources distills with codex | mock only, not the image-gen providers.
  const [form, patch] = usePatchState({ url: "", slug: "", provider: "codex" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [log, setLog] = useStreamLog(window.studio?.onResearchLog);

  async function distill() {
    if (!window.studio?.research) { setLog("studio bridge unavailable — restart the app"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.research({
        url: form.url.trim(),
        slug: form.slug.trim() || slugFromUrl(form.url),
        provider: form.provider,
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
        <TextField label="YouTube URL" grow value={form.url} onChange={(url) => patch({ url })} placeholder="https://www.youtube.com/watch?v=…" />
        <TextField label="Rules file slug" value={form.slug} onChange={(slug) => patch({ slug })} placeholder={form.url ? slugFromUrl(form.url) : "ruleset"} />
        <SelectField label="Provider" value={form.provider} onChange={(provider) => patch({ provider })}>
          <option value="codex">codex — your subscription (no key)</option>
          <option value="mock">mock — offline (transcript only)</option>
        </SelectField>
        <button className="btn btn-primary" type="button" disabled={busy || !form.url.trim()} onClick={distill}>
          {busy ? "Distilling…" : "Distill rules"}
        </button>
        <p className="note">Transcript via yt-dlp (recommended) → distilled to docs/rules/&lt;slug&gt;.md. Codex runs take a minute — watch the log.</p>
      </div>
      <div className="gen-preview">
        {result?.rules ? <pre className="rules">{result.rules}</pre> : <EmptyTile>{busy ? "distilling…" : "ruleset preview"}</EmptyTile>}
        {(log || result) && <LogView err={!!result && !result.ok}>{log || "—"}</LogView>}
        {result?.path && <div className="path">{result.path}</div>}
      </div>
    </div>
  );
}
