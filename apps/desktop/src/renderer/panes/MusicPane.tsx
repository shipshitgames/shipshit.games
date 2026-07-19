import type { GenResult } from "../../shared/ipc";
import { EmptyTile, GameField, LogView, NumField, ProjectManifestNote, SelectField, TextAreaField, TextField } from "../components/ui";
import { usePatchState, useProjectSelection, useStreamLog } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

// Per-category provider options for the Generate-from-prompt mode. suno stays the
// pipeline default for all three kinds; named perpetual-commercial providers
// (ElevenLabs SFX, Beatoven music — issue #21) are offered as selectable choices.
type AudioCategory = "sfx" | "music" | "voice";
const AUDIO_PROVIDERS_BY_CATEGORY: Record<AudioCategory, { id: string; label: string }[]> = {
  sfx: [
    { id: "elevenlabs", label: "ElevenLabs (SFX)" },
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
  music: [
    { id: "beatoven", label: "Beatoven (music loops)" },
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
  voice: [
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
};
const defaultProviderForCategory = (category: AudioCategory) => AUDIO_PROVIDERS_BY_CATEGORY[category][0].id;

// Music + SFX pane: two modes. "Generate" drives @shipshitgames/assetgen to make a
// music loop / SFX / voice clip from a prompt (named perpetual-commercial providers),
// encodes to WebM/Opus and registers it. "Transcode" brings your own audio file →
// WebM/Opus via ffmpeg. Both write into a game's src/assets/audio/<category>/.
export function MusicPane() {
  const [form, patch] = usePatchState({
    mode: "generate" as "generate" | "transcode",
    files: [] as string[],
    category: "music" as AudioCategory,
    bitrate: 128,
    normalize: false,
    genId: "impact-hit",
    prompt: "a brutal metallic impact hit, short and punchy",
    provider: defaultProviderForCategory("music"),
    loop: true,
    volume: 1,
    license: "perpetual commercial; review before shipping",
  });
  const [run, patchRun] = usePatchState({
    busy: false,
    result: null as { ok: boolean; log: string; outputs: string[] } | null,
    genBusy: false,
    genResult: null as GenResult | null,
  });
  const [log, setLog] = useStreamLog(window.studio?.onTranscodeLog, window.studio?.onGenLog);
  const selection = useProjectSelection();
  const { game, selectedProject } = selection;

  // Pick a sensible default provider + loop default when the category changes.
  function changeCategory(next: AudioCategory) {
    patch({ category: next, provider: defaultProviderForCategory(next), loop: next === "music" });
  }

  async function pick() {
    const files = await window.studio?.pickAudioFiles();
    if (files?.length) patch({ files });
  }

  async function transcode() {
    if (!window.studio?.transcodeAudio) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    patchRun({ busy: true, result: null });
    setLog("");
    try {
      patchRun({
        result: await window.studio.transcodeAudio({
          files: form.files,
          game: selectedProject?.slug || game,
          projectId: selectedProject?.id,
          category: form.category,
          bitrate: form.bitrate,
          normalize: form.normalize,
        }),
      });
    } catch (e) {
      setLog(errorMessage(e));
    } finally {
      patchRun({ busy: false });
    }
  }

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    patchRun({ genBusy: true, genResult: null });
    setLog("");
    try {
      patchRun({
        genResult: await window.studio.generate({
          id: form.genId,
          prompt: form.prompt,
          game: selectedProject?.slug || game,
          projectId: selectedProject?.id,
          kind: form.category,
          provider: form.provider,
          category: form.category,
          bitrate: form.bitrate,
          normalize: form.normalize,
          loop: form.loop,
          volume: form.volume,
          license: form.license,
        }),
      });
    } catch (e) {
      setLog(errorMessage(e));
    } finally {
      patchRun({ genBusy: false });
    }
  }

  const providerOptions = AUDIO_PROVIDERS_BY_CATEGORY[form.category];
  const invalidProject = !!(selectedProject && !selectedProject.valid);

  return (
    <div className="gen">
      <div className="gen-form">
        <div className="gen-row">
          <button className={"btn" + (form.mode === "generate" ? " is-active" : "")} type="button" onClick={() => patch({ mode: "generate" })}>Generate from prompt</button>
          <button className={"btn" + (form.mode === "transcode" ? " is-active" : "")} type="button" onClick={() => patch({ mode: "transcode" })}>Transcode a file</button>
        </div>
        <GameField selection={selection} />
        <ProjectManifestNote project={selectedProject} />
        <SelectField label={<>Category → src/assets/audio/&lt;category&gt;/</>} value={form.category} onChange={(next) => changeCategory(next as AudioCategory)}>
          <option value="sfx">sfx</option>
          <option value="music">music</option>
          <option value="voice">voice</option>
        </SelectField>
        {/* The bitrate keeps the browser's min/max attributes only (clamp off):
          * out-of-range values pass through to ffmpeg exactly as typed. */}
        <NumField label="Opus bitrate (kbps)" min={32} max={320} fallback={128} clamp={false} value={form.bitrate} onChange={(bitrate) => patch({ bitrate })} />
        <label className="check"><input type="checkbox" checked={form.normalize} onChange={(e) => patch({ normalize: e.target.checked })} /><span>loudnorm (recommended for SFX)</span></label>

        {form.mode === "generate" ? (
          <>
            <TextField label="Asset ID" value={form.genId} onChange={(genId) => patch({ genId })} placeholder="impact-hit" />
            <TextAreaField label="Prompt" grow value={form.prompt} onChange={(prompt) => patch({ prompt })} />
            <SelectField label="Provider" value={form.provider} onChange={(provider) => patch({ provider })}>
              {providerOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </SelectField>
            <div className="gen-row">
              <label className="check"><input type="checkbox" checked={form.loop} onChange={(e) => patch({ loop: e.target.checked })} /><span>loop</span></label>
              <NumField label="Volume (0–1)" min={0} max={1} step={0.05} value={form.volume} onChange={(volume) => patch({ volume })} />
            </div>
            <TextField label="License record" value={form.license} onChange={(license) => patch({ license })} />
            <button className="btn btn-primary" type="button" disabled={run.genBusy || !form.genId || !form.prompt || invalidProject} onClick={generate}>
              {run.genBusy ? "Generating…" : "Generate"}
            </button>
            <p className="note">Generates a {form.category} clip → encodes to WebM/Opus → registers it in assets.json with category/volume/loop + a license record. Music loops via Soundraw / Beatoven, SFX via ElevenLabs / OptimizerAI (avoid Udio for shipped in-game loops).</p>
          </>
        ) : (
          <>
            <button className="btn" type="button" onClick={pick}>
              {form.files.length ? `${form.files.length} file(s) selected — change` : "Pick source audio…"}
            </button>
            {form.files.length > 0 && <p className="note">{form.files.map((f) => f.split("/").pop()).join(", ")}</p>}
            <button className="btn btn-primary" type="button" disabled={run.busy || !form.files.length || invalidProject} onClick={transcode}>
              {run.busy ? "Transcoding…" : "Transcode → WebM/Opus"}
            </button>
            <p className="note">ffmpeg → opus into the game's audio folder · strips cover art · registers each output in assets.json with a license record.</p>
          </>
        )}
      </div>
      <div className="gen-preview">
        {form.mode === "generate" ? (
          <>
            {run.genResult?.dataUrl
              ? <audio controls src={run.genResult.dataUrl} aria-label={`${form.genId} preview`}><track kind="captions" /></audio>
              : <EmptyTile>{run.genBusy ? "generating…" : "preview"}</EmptyTile>}
            {(log || run.genResult) && <LogView err={!!run.genResult && !run.genResult.ok}>{log || "—"}</LogView>}
            {run.genResult?.path && <div className="path">{run.genResult.path}</div>}
          </>
        ) : (
          <>
            {run.result?.outputs?.length
              ? <pre className="rules">{run.result.outputs.map((o) => o.split("/").slice(-2).join("/")).join("\n")}</pre>
              : <EmptyTile>{run.busy ? "transcoding…" : "outputs"}</EmptyTile>}
            {(log || run.result) && <LogView err={!!run.result && !run.result.ok}>{log || "—"}</LogView>}
          </>
        )}
      </div>
    </div>
  );
}
