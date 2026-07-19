import { useEffect, useRef, type PointerEvent } from "react";

import type { Moodboard, MoodboardItem } from "../../shared/ipc";
import { LogView, SelectField, TextAreaField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

const emptyMoodboard = (game: string): Moodboard => ({ game, items: [], updatedAt: "" });

export function MoodboardPane() {
  const [state, patch] = usePatchState({
    game: "scourge-survivors",
    games: ["scourge-survivors", "deadlane", "pactfall", "starblight"] as string[],
    board: emptyMoodboard("scourge-survivors"),
    note: "",
    error: "",
  });
  const { game, board } = state;
  const drag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    nextX: number;
    nextY: number;
  } | null>(null);

  useEffect(() => {
    // One dispatch once both settle: default game + game list arrive together.
    Promise.allSettled([window.studio?.settings.get(), window.studio?.moodboard.listGames()]).then(([settings, games]) => {
      const defaultGame = settings.status === "fulfilled" ? settings.value?.defaultGame : "";
      const list = games.status === "fulfilled" ? games.value : null;
      if (defaultGame) patch({ game: defaultGame });
      if (list?.length) patch({ games: list });
    });
  }, [patch]);

  useEffect(() => {
    let live = true;
    patch({ error: "" });
    window.studio?.moodboard.get(game)
      .then((board) => { if (live) patch({ board }); })
      .catch((e) => { if (live) patch({ error: errorMessage(e) }); });
    return () => { live = false; };
  }, [game, patch]);

  async function addNote() {
    if (!state.note.trim()) return;
    if (!window.studio?.moodboard) { patch({ error: "studio bridge unavailable" }); return; }
    try {
      patch({ board: await window.studio.moodboard.addNote(game, state.note), note: "" });
    } catch (e) {
      patch({ error: errorMessage(e) });
    }
  }

  async function importImages() {
    if (!window.studio?.moodboard) { patch({ error: "studio bridge unavailable" }); return; }
    try {
      patch({ board: await window.studio.moodboard.importImages(game) });
    } catch (e) {
      patch({ error: errorMessage(e) });
    }
  }

  async function toggleTarget(item: MoodboardItem) {
    if (!window.studio?.moodboard) return;
    patch({ board: await window.studio.moodboard.setVisualTarget(game, item.id, !item.visualTarget) });
  }

  async function removeItem(item: MoodboardItem) {
    if (!window.studio?.moodboard) return;
    patch({ board: await window.studio.moodboard.removeItem(game, item.id) });
  }

  function startDrag(e: PointerEvent<HTMLElement>, item: MoodboardItem) {
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: item.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: item.x,
      originY: item.y,
      nextX: item.x,
      nextY: item.y,
    };
  }

  function moveDrag(e: PointerEvent<HTMLElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
    const nextX = Math.max(0, Math.round(activeDrag.originX + e.clientX - activeDrag.startX));
    const nextY = Math.max(0, Math.round(activeDrag.originY + e.clientY - activeDrag.startY));
    activeDrag.nextX = nextX;
    activeDrag.nextY = nextY;
    patch((current) => ({
      board: {
        ...current.board,
        items: current.board.items.map((item) => item.id === activeDrag.id ? { ...item, x: nextX, y: nextY } : item),
      },
    }));
  }

  async function endDrag(e: PointerEvent<HTMLElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!window.studio?.moodboard) return;
    patch({ board: await window.studio.moodboard.updateItem(game, { id: activeDrag.id, x: activeDrag.nextX, y: activeDrag.nextY }) });
  }

  async function updateNote(item: MoodboardItem, text: string) {
    if (!window.studio?.moodboard || text.trim() === (item.text || "").trim()) return;
    patch({ board: await window.studio.moodboard.updateItem(game, { id: item.id, text }) });
  }

  return (
    <div className="moodboard">
      <aside className="moodboard-tools">
        <SelectField label="Game" value={game} onChange={(game) => patch({ game })}>
          {state.games.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <TextAreaField label="Note" rows={4} value={state.note} onChange={(note) => patch({ note })} placeholder="silhouette, palette, pose, read" />
        <div className="moodboard-actions">
          <button className="btn btn-primary" type="button" onClick={addNote} disabled={!state.note.trim()}>Add note</button>
          <button className="btn" type="button" onClick={importImages}>Import images</button>
        </div>
        <div className="moodboard-stats">
          <span>{board.items.length} items</span>
          <span>{board.items.filter((item) => item.visualTarget).length} targets</span>
        </div>
        {state.error && <LogView err>{state.error}</LogView>}
      </aside>

      <section className="moodboard-stage" aria-label={`${game} moodboard`}>
        <div className="moodboard-canvas">
          {board.items.length === 0 && (
            <div className="moodboard-empty">
              <span>empty board</span>
              <b>{game}</b>
            </div>
          )}
          {board.items.map((item) => (
            <article
              key={item.id}
              className={"moodboard-item" + (item.visualTarget ? " is-target" : "")}
              style={{ width: item.width, height: item.height, transform: `translate(${item.x}px, ${item.y}px)` }}
              onPointerDown={(e) => startDrag(e, item)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <header className="moodboard-item-head">
                <span>{item.type === "image" ? item.image?.name || "reference" : "note"}</span>
                <button type="button" title="Visual target" aria-label="Visual target" className="btn btn-ghost btn-icon" onClick={() => toggleTarget(item)}>
                  {item.visualTarget ? "★" : "☆"}
                </button>
                <button type="button" title="Remove" aria-label="Remove" className="btn btn-ghost btn-icon" onClick={() => removeItem(item)}>×</button>
              </header>
              {item.type === "image" ? (
                item.dataUrl ? <img src={item.dataUrl} alt={item.image?.name || "reference"} /> : <div className="moodboard-missing">missing image</div>
              ) : (
                <textarea aria-label="Note text" defaultValue={item.text || ""} onBlur={(e) => updateNote(item, e.target.value)} />
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
