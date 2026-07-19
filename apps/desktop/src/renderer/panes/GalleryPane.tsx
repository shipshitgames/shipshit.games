import { useCallback, useEffect, useEffectEvent, useMemo } from "react";

import type { GalleryAsset, GalleryResult } from "../../shared/ipc";
import { ModalBackdrop } from "../components/ModalBackdrop";
import { ModalHead } from "../components/ModalHead";
import { LogView, SelectField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { errorMessage, formatBytes } from "../lib/studio";

const GALLERY_EMPTY: GalleryResult = { ok: false, root: null, game: "", games: [], assets: [] };

// Asset gallery — read-only review + compare surface over the shared Deadrot assets
// package. Loads thumbnails inline (with a lazy fallback for deferred ones), groups
// by folder, filters by category/search, and offers a pin-to-compare tray + lightbox.
export function GalleryPane() {
  const [state, patch] = usePatchState({
    game: "scourge-survivors",
    result: GALLERY_EMPTY,
    busy: false,
    category: "all",
    query: "",
    extra: {} as Record<string, string>,
    compare: [] as string[],
    lightbox: null as string | null,
  });
  const { game, result, category, query, extra, compare, lightbox } = state;

  const load = useCallback(async (target: string) => {
    if (!window.studio?.gallery) {
      patch({ result: { ...GALLERY_EMPTY, error: "studio bridge unavailable — restart the app" } });
      return;
    }
    patch({ busy: true, extra: {}, compare: [], lightbox: null });
    try {
      patch({ result: await window.studio.gallery.list(target) });
    } catch (e) {
      patch({ result: { ...GALLERY_EMPTY, game: target, error: errorMessage(e) } });
    } finally {
      patch({ busy: false });
    }
  }, [patch]);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const target = s.defaultGame || "scourge-survivors";
      patch({ game: target });
      void load(target);
    }).catch(() => { void load("scourge-survivors"); });
  }, [load, patch]);

  // Lazily pull thumbnails the main process deferred past its inline byte budget.
  // A fixed-width pool of sequential chains bounds concurrent IPC image reads.
  useEffect(() => {
    const deferred = result.assets.filter((a) => a.deferred && !a.dataUrl && !extra[a.path]);
    if (!deferred.length || !window.studio?.gallery) return;
    let cancelled = false;
    const queue = [...deferred];
    const drain = async (): Promise<void> => {
      const next = queue.shift();
      if (!next || cancelled) return;
      try {
        const img = await window.studio?.gallery.image(next.path);
        if (img?.dataUrl && !cancelled) patch((current) => ({ extra: { ...current.extra, [next.path]: img.dataUrl } }));
      } catch {}
      return drain();
    };
    void Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => drain()));
    return () => { cancelled = true; };
  }, [result, extra, patch]);

  const srcFor = useCallback((asset: GalleryAsset): string | null => asset.dataUrl ?? extra[asset.path] ?? null, [extra]);

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const a of result.assets) set.set(a.category, (set.get(a.category) || 0) + 1);
    return [...set.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [result.assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return result.assets.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!q) return true;
      return a.id.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || a.path.toLowerCase().includes(q);
    });
  }, [result.assets, category, query]);

  const groups = useMemo(() => {
    const map = new Map<string, GalleryAsset[]>();
    for (const a of filtered) {
      const list = map.get(a.group) || [];
      list.push(a);
      map.set(a.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const byId = useMemo(() => new Map(result.assets.map((a) => [a.id, a])), [result.assets]);
  const comparedIds = useMemo(() => new Set(compare), [compare]);
  const compareAssets = compare.flatMap((id) => { const asset = byId.get(id); return asset ? [asset] : []; });
  const lightboxAsset = lightbox ? byId.get(lightbox) || null : null;
  const lightboxIndex = lightboxAsset ? filtered.findIndex((a) => a.id === lightboxAsset.id) : -1;

  const togglePin = useCallback((id: string) => {
    patch((current) => ({
      compare: current.compare.includes(id)
        ? current.compare.filter((x) => x !== id)
        : current.compare.length >= 4 ? current.compare : [...current.compare, id],
    }));
  }, [patch]);

  const copyText = useCallback((value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
  }, []);

  const step = useCallback((delta: number) => {
    patch((current) => {
      if (!current.lightbox) return {};
      const idx = filtered.findIndex((a) => a.id === current.lightbox);
      if (idx < 0) return {};
      const next = filtered[(idx + delta + filtered.length) % filtered.length];
      return next ? { lightbox: next.id } : {};
    });
  }, [filtered, patch]);

  // Keep the keydown subscription stable while reading the latest filtered
  // asset list through `step`.
  const stepFromKey = useEffectEvent((delta: number) => {
    step(delta);
  });

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") patch({ lightbox: null });
      else if (e.key === "ArrowRight") stepFromKey(1);
      else if (e.key === "ArrowLeft") stepFromKey(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, patch]);

  const games = result.games.length ? result.games : [game];

  return (
    <div className="gallery">
      <div className="gallery-toolbar">
        <SelectField label="Game" className="gallery-game" value={game} onChange={(next) => { patch({ game: next }); void load(next); }}>
          {games.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <input
          className="gallery-search"
          aria-label="Search assets"
          value={query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder="Search id, folder, path…"
        />
        <button className="btn" type="button" disabled={state.busy} onClick={() => void load(game)}>{state.busy ? "Loading…" : "Reload"}</button>
      </div>

      <div className="gallery-filter">
        <button type="button" className={"chip" + (category === "all" ? " is-active" : "")} onClick={() => patch({ category: "all" })}>
          all <b>{result.assets.length}</b>
        </button>
        {categories.map(([cat, count]) => (
          <button key={cat} type="button" className={"chip" + (category === cat ? " is-active" : "")} onClick={() => patch({ category: cat })}>
            {cat} <b>{count}</b>
          </button>
        ))}
        <span className="gallery-meta">
          {result.source ? `${result.source}` : ""}
          {result.assetBaseUrl ? " · cdn" : ""}
          {result.assets.some((a) => a.missing) ? ` · ${result.assets.filter((a) => a.missing).length} missing` : ""}
        </span>
      </div>

      {compareAssets.length > 0 && (
        <div className="gallery-compare">
          <div className="gallery-compare-head">
            <span>Compare · {compareAssets.length}/4</span>
            <button className="btn" type="button" onClick={() => patch({ compare: [] })}>Clear</button>
          </div>
          <div className="gallery-compare-row">
            {compareAssets.map((a) => (
              <figure key={a.id} className="gallery-compare-item">
                <button type="button" className="btn btn-ghost btn-icon gallery-compare-remove" aria-label="Remove" onClick={() => togglePin(a.id)}>×</button>
                {srcFor(a) ? <img src={srcFor(a) ?? undefined} alt={a.id} /> : <div className="gallery-missing">{a.missing ? "missing" : "…"}</div>}
                <figcaption>{a.id}{a.dimensions ? ` · ${a.dimensions[0]}×${a.dimensions[1]}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {result.error && <LogView err>{result.error}</LogView>}

      <div className="gallery-scroll">
        {filtered.length === 0 && !state.busy && (
          <div className="gallery-empty">{result.error ? "no assets" : "no matches"}</div>
        )}
        {groups.map(([groupName, assets]) => (
          <section className="gallery-group" key={groupName}>
            <header className="gallery-group-head">{groupName} <span>{assets.length}</span></header>
            <div className="gallery-grid">
              {assets.map((a) => {
                const src = srcFor(a);
                const pinned = comparedIds.has(a.id);
                return (
                  <article className={"gallery-card" + (pinned ? " is-pinned" : "")} key={a.id}>
                    <button type="button" className="gallery-thumb" onClick={() => patch({ lightbox: a.id })} title={a.path}>
                      {a.missing ? (
                        <div className="gallery-missing">missing</div>
                      ) : src ? (
                        <img src={src} alt={a.id} style={a.filter === "nearest" ? { imageRendering: "pixelated" } : undefined} />
                      ) : (
                        <div className="gallery-missing">…</div>
                      )}
                      {a.view && <span className="gallery-tag">{a.view}</span>}
                    </button>
                    <div className="gallery-card-meta">
                      <span className="gallery-card-id" title={a.id}>{a.id}</span>
                      <span className="gallery-card-sub">
                        {a.dimensions ? `${a.dimensions[0]}×${a.dimensions[1]}` : a.type} · {formatBytes(a.bytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={"gallery-pin" + (pinned ? " is-pinned" : "")}
                      onClick={() => togglePin(a.id)}
                      aria-label={pinned ? "Unpin from compare" : "Pin to compare"}
                      title={pinned ? "Unpin" : "Pin to compare"}
                    >
                      {pinned ? "✓" : "⊕"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {lightboxAsset && (
        <ModalBackdrop onClose={() => patch({ lightbox: null })} label="Close lightbox">
          <div className="gallery-lightbox">
            <ModalHead title={lightboxAsset.id} onClose={() => patch({ lightbox: null })}>
              <button className="btn btn-ghost btn-icon" type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
              <span className="gallery-lightbox-count">{lightboxIndex + 1} / {filtered.length}</span>
              <button className="btn btn-ghost btn-icon" type="button" aria-label="Next" onClick={() => step(1)}>›</button>
            </ModalHead>
            <div className="gallery-lightbox-body">
              <div className="gallery-lightbox-stage">
                {srcFor(lightboxAsset) ? (
                  <img src={srcFor(lightboxAsset) ?? undefined} alt={lightboxAsset.id} style={lightboxAsset.filter === "nearest" ? { imageRendering: "pixelated" } : undefined} />
                ) : (
                  <div className="gallery-missing">{lightboxAsset.missing ? "missing on disk" : "loading…"}</div>
                )}
              </div>
              <dl className="gallery-lightbox-meta">
                <dt>category</dt><dd>{lightboxAsset.category}{lightboxAsset.view ? ` · ${lightboxAsset.view}` : ""}</dd>
                <dt>type</dt><dd>{lightboxAsset.type}</dd>
                {lightboxAsset.dimensions && (<><dt>dimensions</dt><dd>{lightboxAsset.dimensions[0]}×{lightboxAsset.dimensions[1]}</dd></>)}
                {lightboxAsset.scale && (<><dt>scale</dt><dd>{lightboxAsset.scale[0]} × {lightboxAsset.scale[1]}</dd></>)}
                {lightboxAsset.filter && (<><dt>filter</dt><dd>{lightboxAsset.filter}</dd></>)}
                {lightboxAsset.role && (<><dt>role</dt><dd>{lightboxAsset.role}</dd></>)}
                <dt>size</dt><dd>{formatBytes(lightboxAsset.bytes)}</dd>
                <dt>path</dt><dd className="gallery-lightbox-path">{lightboxAsset.path}</dd>
                {lightboxAsset.cdnUrl && (
                  <><dt>cdn</dt><dd className="gallery-lightbox-path">{lightboxAsset.cdnUrl}</dd></>
                )}
                {lightboxAsset.license && (
                  <><dt>license</dt><dd>{Object.entries(lightboxAsset.license).map(([k, v]) => `${k}: ${String(v)}`).join("\n")}</dd></>
                )}
              </dl>
            </div>
            <div className="gallery-lightbox-foot">
              <button
                className="btn"
                type="button"
                onClick={() => togglePin(lightboxAsset.id)}
              >
                {comparedIds.has(lightboxAsset.id) ? "Unpin from compare" : "Pin to compare"}
              </button>
              {lightboxAsset.cdnUrl && (
                <>
                  <button className="btn" type="button" onClick={() => copyText(lightboxAsset.cdnUrl!)}>
                    Copy CDN URL
                  </button>
                  <a className="btn" href={lightboxAsset.cdnUrl} target="_blank" rel="noreferrer">
                    Open CDN
                  </a>
                </>
              )}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
