import { useEffect, useMemo } from "react";

import type { MapPreviewResult, MapWriteResult, MapsGenOptions } from "../../shared/ipc";
import { EmptyTile, LogView, NumField, SelectField, TextField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

export function MapsPane() {
  const [form, patch] = usePatchState({
    id: "breach-alpha",
    name: "",
    game: "scourge-survivors",
    seed: 1,
    rooms: 6,
    levels: 2,
    half: 24,
    coverPerRoom: 3,
    spawnRadius: 2.5,
  });
  const [view, patchView] = usePatchState({
    games: ["scourge-survivors"] as string[],
    preview: null as MapPreviewResult | null,
    written: null as MapWriteResult | null,
    busy: false,
    error: "",
  });

  const options: MapsGenOptions = useMemo(
    () => ({
      id: form.id,
      name: form.name.trim() || undefined,
      game: form.game,
      seed: form.seed,
      rooms: form.rooms,
      levels: form.levels,
      half: form.half,
      coverPerRoom: form.coverPerRoom,
      spawnRadius: form.spawnRadius,
    }),
    [form],
  );

  useEffect(() => {
    // One dispatch once both settle: the default game and the game list arrive
    // together instead of redrawing per promise.
    Promise.allSettled([window.studio?.settings.get(), window.studio?.maps.listGames()]).then(([settings, games]) => {
      const defaultGame = settings.status === "fulfilled" ? settings.value?.defaultGame : "";
      const list = games.status === "fulfilled" ? games.value : null;
      if (defaultGame) patch({ game: defaultGame });
      if (list?.length) patchView({ games: list });
    });
  }, [patch, patchView]);

  // Live preview — the generator is pure + in-process, so it is cheap to re-seed
  // on every input change. Failures surface in the validation panel, not a throw.
  useEffect(() => {
    if (!window.studio?.maps || !options.id.trim()) { patchView({ preview: null }); return; }
    let live = true;
    patchView({ error: "" });
    window.studio.maps.preview(options)
      .then((next) => { if (live) patchView({ preview: next, written: null }); })
      .catch((e) => { if (live) patchView({ error: errorMessage(e) }); });
    return () => { live = false; };
  }, [options, patchView]);

  async function write() {
    if (!window.studio?.maps) { patchView({ error: "studio bridge unavailable — restart the app" }); return; }
    if (!form.id.trim()) return;
    patchView({ busy: true, error: "" });
    try {
      const result = await window.studio.maps.write(options);
      patchView({ written: result, error: result.ok ? "" : "layout failed validation — fix the issues above before writing" });
    } catch (e) {
      patchView({ error: errorMessage(e) });
    } finally {
      patchView({ busy: false });
    }
  }

  const { preview, written } = view;
  const summary = preview?.summary;
  const issues = preview && !preview.ok ? preview.validation.issues : [];

  return (
    <div className="gen">
      <div className="gen-form">
        <TextField label="Map ID" value={form.id} onChange={(id) => patch({ id })} placeholder="breach-alpha" />
        <TextField label="Display name" value={form.name} onChange={(name) => patch({ name })} placeholder="(defaults to “<id> breach arena”)" />
        <SelectField label="Game" value={form.game} onChange={(game) => patch({ game })}>
          {view.games.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <div className="gen-row">
          <NumField label="Seed" min={0} integer value={form.seed} onChange={(seed) => patch({ seed })} />
          <NumField label="Rooms" min={1} max={64} fallback={1} value={form.rooms} onChange={(rooms) => patch({ rooms })} />
        </div>
        <div className="gen-row">
          <NumField label="Levels" min={1} max={8} fallback={1} value={form.levels} onChange={(levels) => patch({ levels })} />
          <NumField label="Arena half-extent (m)" min={8} max={200} fallback={24} value={form.half} onChange={(half) => patch({ half })} />
        </div>
        <div className="gen-row">
          <NumField label="Cover / room" min={0} max={20} value={form.coverPerRoom} onChange={(coverPerRoom) => patch({ coverPerRoom })} />
          <NumField label="Spawn radius (m)" min={0.5} max={20} step={0.5} fallback={2.5} value={form.spawnRadius} onChange={(spawnRadius) => patch({ spawnRadius })} />
        </div>
        <div className="hint">preset <b>breach-arena</b> · seeded engine ArenaMap · validated geometry</div>
        <button className="btn btn-primary" type="button" disabled={view.busy || !form.id.trim() || !!(preview && !preview.ok)} onClick={write}>
          {view.busy ? "Writing…" : "Write map module"}
        </button>
        <p className="note">Writes a typed <code>{`${form.id || "<id>"}.maps.ts`}</code> (+ SVG) into the Studio maps folder — copy it into the target game’s <code>data/maps.ts</code>. Layout is deterministic per seed.</p>
      </div>
      <div className="gen-preview">
        {preview?.dataUrl ? (
          <img className="map-preview" src={preview.dataUrl} alt={`${form.id} top-down preview`} />
        ) : <EmptyTile>preview</EmptyTile>}
        {summary && (
          <div className="hint">
            {summary.rooms} rooms · {summary.levels} levels · {summary.obstacles} obstacles · {summary.lights} lights
          </div>
        )}
        {issues.length > 0 && (
          <LogView err>{issues.map((i) => `[${i.code}] ${i.message}`).join("\n")}</LogView>
        )}
        {view.error && <LogView err>{view.error}</LogView>}
        {written?.ok && written.path && <div className="path">{written.path}</div>}
        {written?.ok && written.svgPath && <div className="path">{written.svgPath}</div>}
      </div>
    </div>
  );
}
