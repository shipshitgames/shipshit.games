import type { PointerEvent, RefObject } from "react";

import { DOOM_RAMP } from "../../../../../packages/assetgen/src/pixelize-palette";
import type { SpriteEditorAsset } from "../../shared/ipc";
import type { SpriteFrameCell } from "./sprite-editor-model";

export type Tool = "pencil" | "eraser" | "picker";

interface SpriteEditorViewProps {
  assets: SpriteEditorAsset[];
  asset: SpriteEditorAsset | null;
  cells: SpriteFrameCell[];
  frameIndex: number;
  tool: Tool;
  color: string;
  offPalette: number;
  busy: boolean;
  dirty: boolean;
  certifiedDraft: boolean;
  message: string;
  canUndo: boolean;
  canRedo: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onRefresh: () => void;
  onSelect: (asset: SpriteEditorAsset) => void;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onBeginDraw: (event: PointerEvent<HTMLCanvasElement>) => void;
  onDraw: (event: PointerEvent<HTMLCanvasElement>) => void;
  onDrawingEnd: () => void;
  onFrame: (index: number) => void;
  onSave: () => void;
  onPromote: () => void;
}

function assetKey(asset: SpriteEditorAsset): string {
  return `${asset.origin}:${asset.kind}:${asset.id}`;
}

export function SpriteEditorView({
  assets,
  asset,
  cells,
  frameIndex,
  tool,
  color,
  offPalette,
  busy,
  dirty,
  certifiedDraft,
  message,
  canUndo,
  canRedo,
  canvasRef,
  onRefresh,
  onSelect,
  onTool,
  onColor,
  onUndo,
  onRedo,
  onBeginDraw,
  onDraw,
  onDrawingEnd,
  onFrame,
  onSave,
  onPromote,
}: SpriteEditorViewProps) {
  const frame = cells[Math.min(frameIndex, Math.max(0, cells.length - 1))] ?? null;

  return (
    <section className="sprite-editor">
      <div className="sprite-editor-head">
        <div>
          <strong>Pixel editor</strong>
          <span>Piskel-style frame retouch · drafts first</span>
        </div>
        <button className="btn" type="button" disabled={busy} onClick={onRefresh}>
          {busy ? "Working…" : "Reload assets"}
        </button>
      </div>
      <div className="sprite-editor-source">
        <label>
          Sprite
          <select
            value={asset ? assetKey(asset) : ""}
            onChange={(event) => {
              const next = assets.find((candidate) => assetKey(candidate) === event.target.value);
              if (next) onSelect(next);
            }}
          >
            {!asset && <option value="">No sprites found</option>}
            {assets.map((candidate) => (
              <option key={assetKey(candidate)} value={assetKey(candidate)}>
                {candidate.id} · {candidate.kind} · {candidate.origin}
              </option>
            ))}
          </select>
        </label>
        <span className={`sprite-editor-status ${asset?.origin === "draft" ? "is-draft" : ""}`}>
          {asset?.origin || "empty"}
        </span>
      </div>
      {asset && frame && (
        <div className="sprite-editor-workspace">
          <div className="sprite-editor-tools">
            {(["pencil", "eraser", "picker"] as Tool[]).map((candidate) => (
              <button
                key={candidate}
                className={`btn ${tool === candidate ? "is-active" : ""}`}
                type="button"
                aria-pressed={tool === candidate}
                onClick={() => onTool(candidate)}
              >
                {candidate}
              </button>
            ))}
            <button className="btn" type="button" disabled={!canUndo} onClick={onUndo}>
              undo
            </button>
            <button className="btn" type="button" disabled={!canRedo} onClick={onRedo}>
              redo
            </button>
            <input
              aria-label="Custom pixel color"
              type="color"
              value={color}
              onChange={(event) => onColor(event.target.value)}
            />
          </div>
          <div className="sprite-editor-palette" aria-label="DOOM palette">
            {DOOM_RAMP.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                title={swatch}
                className={color === swatch ? "is-active" : ""}
                aria-pressed={color === swatch}
                style={{ background: swatch }}
                onClick={() => {
                  onColor(swatch);
                  onTool("pencil");
                }}
              />
            ))}
          </div>
          <div className="sprite-editor-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="sprite-editor-canvas"
              aria-label={`Edit ${frame.label}`}
              onPointerDown={onBeginDraw}
              onPointerMove={onDraw}
              onPointerUp={onDrawingEnd}
              onPointerCancel={onDrawingEnd}
            />
          </div>
          <div className="sprite-editor-frames">
            {cells.map((cell) => (
              <button
                key={cell.index}
                type="button"
                className={`btn ${frameIndex === cell.index ? "is-active" : ""}`}
                aria-pressed={frameIndex === cell.index}
                onClick={() => onFrame(cell.index)}
              >
                {cell.label}
              </button>
            ))}
          </div>
          <div className="sprite-editor-audit">
            <span>
              {offPalette === 0
                ? "palette clean"
                : `${offPalette} off-palette pixel${offPalette === 1 ? "" : "s"} · corrected on save`}
            </span>
            <span>
              {asset.provider || "unknown provider"} · {asset.prompt || "no prompt"}
            </span>
          </div>
          <div className="sprite-editor-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={onSave}>
              Save palette-locked draft
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || asset.origin !== "draft" || dirty || !certifiedDraft}
              onClick={onPromote}
            >
              Promote approved draft
            </button>
          </div>
        </div>
      )}
      {message && (
        <output className="sprite-editor-message" aria-live="polite">
          {message}
        </output>
      )}
    </section>
  );
}
