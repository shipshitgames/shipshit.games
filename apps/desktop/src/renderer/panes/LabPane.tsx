import { useEffect } from "react";

import type { ArtLab, ArtLabVariant } from "../../shared/ipc";
import { LogView, SelectField, TextAreaField } from "../components/ui";
import { usePatchState, useStreamLog } from "../lib/hooks";
import { PROVIDERS } from "../lib/sections";
import { errorMessage, withSettingsDefaults } from "../lib/studio";

// The Lab re-runs generate() with an image kind, so it can only offer the kinds
// assetgen actually renders as images (IMAGE_KINDS / FAL_IMAGE_KINDS). Picking a
// non-image kind made generation throw "<provider> does not support <kind>". The
// live list comes from the catalog over studio:models (falImageKinds, the same
// source SettingsPane reads); this is the fallback when the catalog isn't loaded.
const LAB_KINDS = ["sprite", "sprite-anim", "texture", "icon", "map"];
// Image-capable providers only: the shared PROVIDERS list carries audio-only
// "suno", which always errors for an image kind.
const AUDIO_ONLY_PROVIDERS = new Set(["suno"]);
const LAB_PROVIDERS = PROVIDERS.filter((p) => !AUDIO_ONLY_PROVIDERS.has(p.id));
const emptyLab = (game: string): ArtLab => ({ game, subject: "", kind: "sprite", variants: [], lock: null, createdAt: "", updatedAt: "" });

function labSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "lab";
}

// Uncontrolled variant metadata fields. The parent keys them by the saved value,
// so unrelated re-renders cannot wipe an in-progress edit, while committed
// server-side normalization still remounts the input with the latest value.
function LabTagsField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  return (
    <input
      className="lab-tags"
      aria-label="Variant tags"
      defaultValue={value}
      placeholder="tags, comma, separated"
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next.trim() !== value.trim()) onCommit(next);
        else event.currentTarget.value = value;
      }}
    />
  );
}

function LabNoteField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  return (
    <textarea
      className="lab-note"
      aria-label="Variant note"
      defaultValue={value}
      rows={2}
      placeholder="critique / note"
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next.trim() !== value.trim()) onCommit(next);
        else event.currentTarget.value = value;
      }}
    />
  );
}

// Art Direction Lab (#82): one subject, many style-direction variants. Each
// variant is a real generate() run (subject + direction prompt) filed under the
// game's lab; the chosen one locks into a pipeline-readable style-target contract.
export function LabPane() {
  const [state, patch] = usePatchState({
    game: "scourge-survivors",
    games: ["scourge-survivors", "deadlane", "pactfall", "starblight"] as string[],
    lab: emptyLab("scourge-survivors"),
    subject: "",
    kind: "sprite",
    provider: "codex",
    direction: "",
    // The image kinds assetgen can render, sourced from the catalog over
    // studio:models (the same falImageKinds SettingsPane reads). Falls back to
    // the static LAB_KINDS until the catalog loads so the picker is never empty.
    kinds: LAB_KINDS,
    busy: false,
    error: "",
  });
  const { game, lab } = state;
  const [log, setLog] = useStreamLog(window.studio?.onGenLog);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const next = withSettingsDefaults(s);
      const fallback = next.providerDefaults.sprite || next.defaultProvider;
      patch({
        ...(s.defaultGame ? { game: s.defaultGame } : {}),
        // Never seed an audio-only provider into an image-only pane.
        provider: LAB_PROVIDERS.some((p) => p.id === fallback) ? fallback : LAB_PROVIDERS[0].id,
      });
    }).catch(() => {});
    window.studio?.models?.list().then((m) => {
      const list = m?.falImageKinds?.length ? m.falImageKinds : LAB_KINDS;
      // If a stale/non-image kind is selected, snap to the first real one.
      patch((current) => ({ kinds: list, kind: list.includes(current.kind) ? current.kind : list[0] }));
    }).catch(() => {});
    window.studio?.lab.listGames().then((list) => list?.length && patch({ games: list })).catch(() => {});
  }, [patch]);

  useEffect(() => {
    let live = true;
    patch({ error: "" });
    window.studio?.lab.get(game)
      .then((next) => {
        if (!live) return;
        // A lab persisted before kinds were restricted may carry a non-image
        // kind (e.g. "scene"); clamp it to a real image kind so generation
        // can't throw. The function patch reads the latest catalog kinds.
        patch((current) => {
          const stored = next.kind || "sprite";
          return {
            lab: next,
            subject: next.subject,
            kind: current.kinds.includes(stored) ? stored : current.kinds[0],
          };
        });
      })
      .catch((e) => { if (live) patch({ error: errorMessage(e) }); });
    return () => { live = false; };
  }, [game, patch]);

  const subjectDirty = state.subject.trim() !== (lab.subject || "").trim() || state.kind !== (lab.kind || "sprite");

  async function saveSubject() {
    if (!window.studio?.lab) { patch({ error: "studio bridge unavailable" }); return; }
    try { patch({ lab: await window.studio.lab.setSubject(game, state.subject, state.kind) }); }
    catch (e) { patch({ error: errorMessage(e) }); }
  }

  async function generateVariant() {
    if (!window.studio?.generate || !window.studio.lab) { setLog("studio bridge unavailable — restart the app"); return; }
    const base = state.subject.trim();
    if (!base) { patch({ error: "set a subject first" }); return; }
    patch({ busy: true, error: "" });
    setLog("");
    try {
      // Persist subject/kind first so every variant matches what's on screen.
      if (subjectDirty) patch({ lab: await window.studio.lab.setSubject(game, state.subject, state.kind) });
      const prompt = [base, state.direction.trim()].filter(Boolean).join(" — ");
      const genId = `lab-${labSlug(base)}-${Math.random().toString(36).slice(2, 7)}`;
      const result = await window.studio.generate({ id: genId, prompt, game, kind: state.kind, provider: state.provider });
      if (!result.ok || !result.dataUrl) {
        patch({ error: result.ok ? "generation produced no previewable image" : "generation failed — see log" });
        return;
      }
      patch({
        lab: await window.studio.lab.addVariant(game, {
          direction: state.direction.trim(),
          prompt,
          provider: state.provider,
          dataUrl: result.dataUrl,
          sourcePath: result.path,
          mime: result.mediaType || undefined,
        }),
        direction: "",
      });
    } catch (e) {
      patch({ error: errorMessage(e) });
    } finally {
      patch({ busy: false });
    }
  }

  // Every variant mutation funnels through here so a rejected IPC call surfaces an
  // error instead of silently no-op'ing — and a dead bridge says so out loud.
  async function runMutation(fn: (lab: NonNullable<typeof window.studio>["lab"]) => Promise<ArtLab>) {
    const api = window.studio?.lab;
    if (!api) { patch({ error: "studio bridge unavailable — restart the app" }); return; }
    try { patch({ error: "", lab: await fn(api) }); }
    catch (e) { patch({ error: errorMessage(e) }); }
  }

  function scoreVariant(variant: ArtLabVariant, value: number) {
    return runMutation((api) => api.scoreVariant(game, variant.id, value === variant.score ? 0 : value));
  }
  function retagVariant(variant: ArtLabVariant, value: string) {
    const tags = value.split(",").flatMap((tag) => {
      const trimmed = tag.trim();
      return trimmed ? [trimmed] : [];
    });
    return runMutation((api) => api.tagVariant(game, variant.id, tags));
  }
  function annotateVariant(variant: ArtLabVariant, value: string) {
    if (value.trim() === (variant.note || "").trim()) return;
    return runMutation((api) => api.annotateVariant(game, variant.id, value));
  }
  function removeVariant(variant: ArtLabVariant) {
    return runMutation((api) => api.removeVariant(game, variant.id));
  }
  function toggleLock(variant: ArtLabVariant) {
    return runMutation((api) => (variant.locked ? api.clearLock(game) : api.lockVariant(game, variant.id)));
  }
  function clearLock() {
    return runMutation((api) => api.clearLock(game));
  }

  return (
    <div className="lab">
      <aside className="lab-tools">
        <SelectField label="Game" value={game} onChange={(game) => patch({ game })}>
          {state.games.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <TextAreaField label="Subject" value={state.subject} onChange={(subject) => patch({ subject })} placeholder="the base art concept — e.g. a rotting Scourge husk mid-lunge" />
        <div className="gen-row">
          <SelectField label="Kind" value={state.kind} onChange={(kind) => patch({ kind })}>
            {state.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </SelectField>
          <SelectField label="Provider" value={state.provider} onChange={(provider) => patch({ provider })}>
            {LAB_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </SelectField>
        </div>
        <button className="btn" type="button" onClick={saveSubject} disabled={!subjectDirty || !state.subject.trim()}>
          {subjectDirty ? "Save subject" : "Subject saved"}
        </button>
        <TextAreaField label="Style direction" value={state.direction} onChange={(direction) => patch({ direction })} placeholder="this variant's look — e.g. high-contrast rim light, desaturated, wet gore" />
        <button className="btn btn-primary" type="button" onClick={generateVariant} disabled={state.busy || !state.subject.trim()}>
          {state.busy ? "Forging variant…" : "Generate variant"}
        </button>
        <p className="note">Re-prompts the subject with this style direction via the <b>{state.provider}</b> pipeline, then files the result under {game}'s lab. Locking writes a style-target contract the pipeline can read later (#56).</p>
        <div className="lab-stats">
          <span>{lab.variants.length} variants</span>
          <span>{lab.lock ? "1 locked" : "no lock"}</span>
        </div>
        {state.error && <LogView err>{state.error}</LogView>}
        {(state.busy || log) && <LogView>{log || "—"}</LogView>}
      </aside>

      <section className="lab-stage" aria-label={`${game} art lab`}>
        {lab.lock && (
          <div className="lab-lock">
            <div className="lab-lock-thumb">
              {lab.lock.dataUrl ? <img src={lab.lock.dataUrl} alt="locked style target" /> : <div className="lab-missing">no image</div>}
            </div>
            <div className="lab-lock-body">
              <span className="lab-lock-tag">★ locked style target</span>
              <strong>{lab.lock.direction || "(no direction)"}</strong>
              <code className="lab-lock-prompt">{lab.lock.prompt}</code>
            </div>
            <button className="btn" type="button" onClick={clearLock}>Clear lock</button>
          </div>
        )}

        {lab.variants.length === 0 ? (
          <div className="empty-block">
            <span>no variants yet</span>
            <b>{game}</b>
          </div>
        ) : (
          <div className="lab-grid">
            {lab.variants.map((variant) => (
              <article key={variant.id} className={"lab-card" + (variant.locked ? " is-locked" : "")}>
                <div className="lab-card-img">
                  {variant.dataUrl ? <img src={variant.dataUrl} alt={variant.direction || "variant"} /> : <div className="lab-missing">missing image</div>}
                </div>
                <div className="lab-card-body">
                  <div className="lab-direction">{variant.direction || <em>no direction</em>}</div>
                  <fieldset className="lab-score" aria-label="Score">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className={"lab-star" + (n <= variant.score ? " is-on" : "")} aria-label={`Score ${n}`} onClick={() => scoreVariant(variant, n)}>★</button>
                    ))}
                  </fieldset>
                  <LabTagsField
                    key={`${variant.id}:tags:${variant.tags.join(",")}`}
                    value={variant.tags.join(", ")}
                    onCommit={(next) => retagVariant(variant, next)}
                  />
                  <LabNoteField
                    key={`${variant.id}:note:${variant.note}`}
                    value={variant.note}
                    onCommit={(next) => annotateVariant(variant, next)}
                  />
                  <div className="lab-card-actions">
                    <button type="button" className="btn" onClick={() => toggleLock(variant)}>{variant.locked ? "Unlock" : "Lock as target"}</button>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove variant" title="Remove" onClick={() => removeVariant(variant)}>×</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
