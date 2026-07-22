import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { DOOM_RAMP } from "../../../../../packages/assetgen/src/pixelize-palette";
import type { SpriteEditorAsset } from "../../shared/ipc";
import { errorMessage } from "../lib/studio";
import {
  offPalettePixelCount,
  pointerToPixel,
  spriteFrameCells,
} from "./sprite-editor-model";

interface SpriteEditorProps {
  projectId?: string;
  game: string;
  generatedPath?: string | null;
}

type Tool = "pencil" | "eraser" | "picker";

function selector(asset: SpriteEditorAsset) {
  return { id: asset.id, kind: asset.kind, origin: asset.origin };
}

function assetKey(asset: SpriteEditorAsset): string {
  return `${asset.origin}:${asset.kind}:${asset.id}`;
}

export function SpriteEditor({
  projectId,
  game,
  generatedPath,
}: SpriteEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLCanvasElement | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const [assets, setAssets] = useState<SpriteEditorAsset[]>([]);
  const [asset, setAsset] = useState<SpriteEditorAsset | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#e9e3d6");
  const [revision, setRevision] = useState(0);
  const [offPalette, setOffPalette] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [certifiedDraft, setCertifiedDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const cells = useMemo(() => {
    const sheet = sheetRef.current;
    return asset && sheet
      ? spriteFrameCells(asset, sheet.width, sheet.height)
      : [];
  }, [asset, revision]);
  const frame =
    cells[Math.min(frameIndex, Math.max(0, cells.length - 1))] ?? null;

  const audit = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    setOffPalette(
      offPalettePixelCount(
        context.getImageData(0, 0, sheet.width, sheet.height).data,
        DOOM_RAMP,
      ),
    );
  }, []);

  const redraw = useCallback(() => {
    const visible = canvasRef.current;
    const sheet = sheetRef.current;
    const active = frame;
    if (!visible || !sheet || !active) return;
    visible.width = active.width;
    visible.height = active.height;
    const context = visible.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, visible.width, visible.height);
    context.drawImage(
      sheet,
      active.x,
      active.y,
      active.width,
      active.height,
      0,
      0,
      active.width,
      active.height,
    );
  }, [frame]);

  useEffect(() => {
    redraw();
  }, [redraw, revision]);

  const loadAsset = useCallback(
    async (next: SpriteEditorAsset) => {
      if (!window.studio?.sprites) return;
      setBusy(true);
      setMessage("");
      try {
        const result = await window.studio.sprites.load(
          projectId,
          game,
          selector(next),
        );
        if (!result.ok || !result.asset || !result.dataUrl)
          throw new Error(result.error || "sprite load failed");
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("sprite image could not be decoded"));
          image.src = result.dataUrl!;
        });
        const sheet = document.createElement("canvas");
        sheet.width = image.naturalWidth;
        sheet.height = image.naturalHeight;
        const context = sheet.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("canvas context unavailable");
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        sheetRef.current = sheet;
        undoRef.current = [];
        redoRef.current = [];
        setAsset(result.asset);
        setFrameIndex(0);
        setDirty(false);
        setCertifiedDraft(false);
        setRevision((value) => value + 1);
        setMessage(`${result.asset.origin} · ${result.asset.path}`);
        requestAnimationFrame(audit);
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [audit, game, projectId],
  );

  const refresh = useCallback(async () => {
    if (!window.studio?.sprites) return;
    setBusy(true);
    try {
      const result = await window.studio.sprites.list(projectId, game);
      if (!result.ok)
        throw new Error(result.error || "sprite catalog unavailable");
      setAssets(result.assets);
      const normalizedGenerated = generatedPath?.replace(/\\/g, "/");
      const generated = normalizedGenerated
        ? result.assets.find(
            (candidate) =>
              candidate.origin === "draft" &&
              normalizedGenerated.endsWith(`/drafts/${candidate.path}`),
          )
        : null;
      const current = asset
        ? result.assets.find(
            (candidate) => assetKey(candidate) === assetKey(asset),
          )
        : null;
      const next = generated || current || result.assets[0];
      if (next && (!asset || assetKey(next) !== assetKey(asset) || generated))
        await loadAsset(next);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [asset, game, generatedPath, loadAsset, projectId]);

  const refreshFromScope = useEffectEvent(() => {
    void refresh();
  });
  useEffect(() => {
    refreshFromScope();
  }, [game, projectId, generatedPath]);

  function snapshot(): ImageData | null {
    const sheet = sheetRef.current;
    const context = sheet?.getContext("2d", { willReadFrequently: true });
    return sheet && context
      ? context.getImageData(0, 0, sheet.width, sheet.height)
      : null;
  }

  function restore(stack: ImageData[], destination: ImageData[]) {
    const sheet = sheetRef.current;
    const context = sheet?.getContext("2d", { willReadFrequently: true });
    const next = stack.pop();
    const current = snapshot();
    if (!sheet || !context || !next || !current) return;
    destination.push(current);
    context.putImageData(next, 0, 0);
    setDirty(true);
    setCertifiedDraft(false);
    setRevision((value) => value + 1);
    audit();
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !frame || !sheetRef.current) return;
    const point = pointerToPixel(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      frame,
    );
    if (!point) return;
    const context = sheetRef.current.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) return;
    if (tool === "picker") {
      const pixel = context.getImageData(point.x, point.y, 1, 1).data;
      setColor(
        `#${[pixel[0], pixel[1], pixel[2]].map((value) => (value ?? 0).toString(16).padStart(2, "0")).join("")}`,
      );
      drawingRef.current = false;
      return;
    }
    if (tool === "eraser") context.clearRect(point.x, point.y, 1, 1);
    else {
      context.fillStyle = color;
      context.fillRect(point.x, point.y, 1, 1);
    }
    setDirty(true);
    setCertifiedDraft(false);
    setRevision((value) => value + 1);
  }

  function beginDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = snapshot();
    if (current) {
      undoRef.current.push(current);
      if (undoRef.current.length > 40) undoRef.current.shift();
      redoRef.current = [];
    }
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(event);
  }

  async function saveDraft() {
    const sheet = sheetRef.current;
    if (!asset || !sheet) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.studio.sprites.saveDraft({
        projectId,
        game,
        asset: selector(asset),
        dataUrl: sheet.toDataURL("image/png"),
        width: sheet.width,
        height: sheet.height,
        offPaletteCount: offPalette,
      });
      if (!result.ok || !result.asset || !result.dataUrl)
        throw new Error(result.error || "draft save failed");
      await loadAsset(result.asset);
      setCertifiedDraft(true);
      setOffPalette(0);
      setMessage(
        `${result.correctedOffPalette || 0} off-palette pixels corrected · draft saved`,
      );
      const listed = await window.studio.sprites.list(projectId, game);
      if (listed.ok) setAssets(listed.assets);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    if (!asset || asset.origin !== "draft" || dirty || !certifiedDraft) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.studio.sprites.promote(
        projectId,
        game,
        selector(asset),
      );
      if (!result.ok || !result.asset)
        throw new Error(result.error || "promotion failed");
      await refresh();
      await loadAsset(result.asset);
      setMessage(`promoted · provenance preserved · ${result.asset.path}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sprite-editor">
      <div className="sprite-editor-head">
        <div>
          <strong>Pixel editor</strong>
          <span>Piskel-style frame retouch · drafts first</span>
        </div>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Working…" : "Reload assets"}
        </button>
      </div>
      <div className="sprite-editor-source">
        <label>
          Sprite
          <select
            value={asset ? assetKey(asset) : ""}
            onChange={(event) => {
              const next = assets.find(
                (candidate) => assetKey(candidate) === event.target.value,
              );
              if (next) void loadAsset(next);
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
        <span
          className={`sprite-editor-status ${asset?.origin === "draft" ? "is-draft" : ""}`}
        >
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
                onClick={() => setTool(candidate)}
              >
                {candidate}
              </button>
            ))}
            <button
              className="btn"
              type="button"
              disabled={!undoRef.current.length}
              onClick={() => restore(undoRef.current, redoRef.current)}
            >
              undo
            </button>
            <button
              className="btn"
              type="button"
              disabled={!redoRef.current.length}
              onClick={() => restore(redoRef.current, undoRef.current)}
            >
              redo
            </button>
            <input
              aria-label="Custom pixel color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
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
                  setColor(swatch);
                  setTool("pencil");
                }}
              />
            ))}
          </div>
          <div className="sprite-editor-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="sprite-editor-canvas"
              aria-label={`Edit ${frame.label}`}
              onPointerDown={beginDraw}
              onPointerMove={draw}
              onPointerUp={() => {
                drawingRef.current = false;
                audit();
              }}
              onPointerCancel={() => {
                drawingRef.current = false;
                audit();
              }}
            />
          </div>
          <div className="sprite-editor-frames">
            {cells.map((cell) => (
              <button
                key={cell.index}
                type="button"
                className={`btn ${frameIndex === cell.index ? "is-active" : ""}`}
                aria-pressed={frameIndex === cell.index}
                onClick={() => setFrameIndex(cell.index)}
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
              {asset.provider || "unknown provider"} ·{" "}
              {asset.prompt || "no prompt"}
            </span>
          </div>
          <div className="sprite-editor-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              Save palette-locked draft
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                busy || asset.origin !== "draft" || dirty || !certifiedDraft
              }
              onClick={() => void promote()}
            >
              Promote approved draft
            </button>
          </div>
        </div>
      )}
      {message && <div className="sprite-editor-message" role="status" aria-live="polite">{message}</div>}
    </section>
  );
}
