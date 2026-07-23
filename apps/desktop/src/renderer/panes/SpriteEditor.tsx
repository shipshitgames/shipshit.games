import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";

import { DOOM_RAMP } from "../../../../../packages/assetgen/src/pixelize-palette";
import type { SpriteEditorAsset } from "../../shared/ipc";
import { errorMessage } from "../lib/studio";
import {
  offPalettePixelCount,
  pointerToPixel,
  spriteFrameCells,
} from "./sprite-editor-model";
import { SpriteEditorView, type Tool } from "./SpriteEditorView";

interface SpriteEditorProps {
  projectId?: string;
  game: string;
  generatedPath?: string | null;
}

interface EditorState {
  assets: SpriteEditorAsset[];
  asset: SpriteEditorAsset | null;
  frameIndex: number;
  tool: Tool;
  color: string;
  revision: number;
  offPalette: number;
  dirty: boolean;
  certifiedDraft: boolean;
  busy: boolean;
  message: string;
}

const INITIAL_STATE: EditorState = {
  assets: [],
  asset: null,
  frameIndex: 0,
  tool: "pencil",
  color: "#e9e3d6",
  revision: 0,
  offPalette: 0,
  dirty: false,
  certifiedDraft: false,
  busy: false,
  message: "",
};

type EditorUpdate = Partial<EditorState> | ((state: EditorState) => Partial<EditorState>);

function updateEditorState(state: EditorState, update: EditorUpdate): EditorState {
  return { ...state, ...(typeof update === "function" ? update(state) : update) };
}

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
  const [state, update] = useReducer(updateEditorState, INITIAL_STATE);
  const { assets, asset, frameIndex, tool, color, offPalette, dirty, certifiedDraft, busy, message } = state;
  const sheet = sheetRef.current;
  const cells = asset && sheet ? spriteFrameCells(asset, sheet.width, sheet.height) : [];
  const frame = cells[Math.min(frameIndex, Math.max(0, cells.length - 1))] ?? null;

  const audit = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    update({ offPalette: offPalettePixelCount(context.getImageData(0, 0, sheet.width, sheet.height).data, DOOM_RAMP) });
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
    context.drawImage(sheet, active.x, active.y, active.width, active.height, 0, 0, active.width, active.height);
  }, [frame]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const loadAsset = useCallback(
    async (next: SpriteEditorAsset) => {
      if (!window.studio?.sprites) return;
      update({ busy: true, message: "" });
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
        update((current) => ({
          asset: result.asset!,
          frameIndex: 0,
          dirty: false,
          certifiedDraft: false,
          revision: current.revision + 1,
          message: `${result.asset!.origin} · ${result.asset!.path}`,
        }));
        requestAnimationFrame(audit);
      } catch (error) {
        update({ message: errorMessage(error) });
      } finally {
        update({ busy: false });
      }
    },
    [audit, game, projectId],
  );

  const refresh = useCallback(async () => {
    if (!window.studio?.sprites) return;
    update({ busy: true });
    try {
      const result = await window.studio.sprites.list(projectId, game);
      if (!result.ok)
        throw new Error(result.error || "sprite catalog unavailable");
      update({ assets: result.assets });
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
      update({ message: errorMessage(error) });
    } finally {
      update({ busy: false });
    }
  }, [asset, game, generatedPath, loadAsset, projectId]);

  const loadScope = useCallback(async () => {
    update({ busy: true });
    try {
      const result = await window.studio.sprites.list(projectId, game);
      if (!result.ok) throw new Error(result.error || "sprite catalog unavailable");
      update({ assets: result.assets });
      const normalizedGenerated = generatedPath?.replace(/\\/g, "/");
      const generated = normalizedGenerated
        ? result.assets.find(
            (candidate) => candidate.origin === "draft" && normalizedGenerated.endsWith(`/drafts/${candidate.path}`),
          )
        : null;
      const next = generated || result.assets[0];
      if (next) await loadAsset(next);
    } catch (error) {
      update({ message: errorMessage(error) });
    } finally {
      update({ busy: false });
    }
  }, [game, generatedPath, loadAsset, projectId]);

  useEffect(() => {
    void loadScope();
  }, [loadScope]);

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
    update((state) => ({ dirty: true, certifiedDraft: false, revision: state.revision + 1 }));
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
      update({ color: `#${[pixel[0], pixel[1], pixel[2]].map((value) => (value ?? 0).toString(16).padStart(2, "0")).join("")}` });
      drawingRef.current = false;
      return;
    }
    if (tool === "eraser") context.clearRect(point.x, point.y, 1, 1);
    else {
      context.fillStyle = color;
      context.fillRect(point.x, point.y, 1, 1);
    }
    update((state) => ({ dirty: true, certifiedDraft: false, revision: state.revision + 1 }));
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
    update({ busy: true, message: "" });
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
      update({
        certifiedDraft: true,
        offPalette: 0,
        message: `${result.correctedOffPalette || 0} off-palette pixels corrected · draft saved`,
      });
      const listed = await window.studio.sprites.list(projectId, game);
      if (listed.ok) update({ assets: listed.assets });
    } catch (error) {
      update({ message: errorMessage(error) });
    } finally {
      update({ busy: false });
    }
  }

  async function promote() {
    if (!asset || asset.origin !== "draft" || dirty || !certifiedDraft) return;
    update({ busy: true, message: "" });
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
      update({ message: `promoted · provenance preserved · ${result.asset.path}` });
    } catch (error) {
      update({ message: errorMessage(error) });
    } finally {
      update({ busy: false });
    }
  }

  return (
    <SpriteEditorView
      assets={assets}
      asset={asset}
      cells={cells}
      frameIndex={frameIndex}
      tool={tool}
      color={color}
      offPalette={offPalette}
      busy={busy}
      dirty={dirty}
      certifiedDraft={certifiedDraft}
      message={message}
      canUndo={undoRef.current.length > 0}
      canRedo={redoRef.current.length > 0}
      canvasRef={canvasRef}
      onRefresh={() => void refresh()}
      onSelect={(next) => void loadAsset(next)}
      onTool={(next) => update({ tool: next })}
      onColor={(next) => update({ color: next })}
      onUndo={() => restore(undoRef.current, redoRef.current)}
      onRedo={() => restore(redoRef.current, undoRef.current)}
      onBeginDraw={beginDraw}
      onDraw={draw}
      onDrawingEnd={() => {
        drawingRef.current = false;
        audit();
      }}
      onFrame={(next) => update({ frameIndex: next })}
      onSave={() => void saveDraft()}
      onPromote={() => void promote()}
    />
  );
}
