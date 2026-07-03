"use client";

/**
 * Provenance lightbox built on the native <dialog> element — no extra deps.
 * Pixel sprites are upscaled at integer multiples of their native dimensions
 * so the DOOM-ramp pixels stay square; large raster art falls back to a
 * contain fit. Arrow keys walk the filtered list, Esc closes (native cancel).
 */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { AssetIndexEntry } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import {
  FACTION_LABELS,
  KIND_SINGULAR,
  assetSrc,
  factionGroup,
  formatDimensions,
  gameLabel,
} from "./asset-meta";

export function AssetLightbox({
  entries,
  index,
  gameTitles,
  onClose,
  onNavigate,
}: {
  /** The currently filtered list the lightbox navigates through. */
  entries: AssetIndexEntry[];
  /** Index into `entries`, or null when closed. */
  index: number | null;
  gameTitles: Record<string, string>;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const entry = index === null ? undefined : entries[index];
  const open = entry !== undefined;

  // Keep the native dialog in sync with React state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Native close (Esc / backdrop / close button) → notify the browser.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  // Freeze page scroll while the modal is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Integer pixel scale: largest whole multiple of the native dimensions that
  // fits the preview pane (~60vh). Null → CSS contain fallback (big covers,
  // unknown dimensions).
  const scaleKey = open && entry?.dimensions ? entry.id : null;
  const [pixelScaleMeasurement, setPixelScaleMeasurement] = useState<{
    key: string;
    scale: number | null;
  } | null>(null);
  const pixelScale =
    pixelScaleMeasurement?.key === scaleKey ? pixelScaleMeasurement.scale : null;

  useEffect(() => {
    if (!scaleKey || !entry?.dimensions) return;
    const [nativeWidth, nativeHeight] = entry.dimensions;
    const compute = () => {
      const pane = previewRef.current;
      const maxWidth = (pane?.clientWidth ?? window.innerWidth * 0.5) - 48;
      const maxHeight = (pane?.clientHeight ?? window.innerHeight * 0.6) - 48;
      const fit = Math.min(
        Math.floor(maxWidth / nativeWidth),
        Math.floor(maxHeight / nativeHeight)
      );
      setPixelScaleMeasurement({
        key: scaleKey,
        scale: fit >= 1 ? fit : null,
      });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [scaleKey, entry]);

  const count = entries.length;
  const goPrev = () => {
    if (index === null || count < 2) return;
    onNavigate((index - 1 + count) % count);
  };
  const goNext = () => {
    if (index === null || count < 2) return;
    onNavigate((index + 1) % count);
  };

  const faction = entry ? FACTION_LABELS[factionGroup(entry.faction)] : null;
  const game = entry ? gameLabel(entry.game, gameTitles) : null;
  const dimensions = entry ? formatDimensions(entry.dimensions) : null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={entry ? `${entry.name} asset details` : "Asset details"}
      className="m-auto w-[min(96vw,68rem)] overflow-hidden rounded-md border border-gunmetal bg-coal p-0 text-ash shadow-[0_28px_70px_rgba(0,0,0,0.72)] backdrop:bg-void/85 backdrop:backdrop-blur-[2px]"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goPrev();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          goNext();
        }
      }}
      onMouseDown={(event) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      {entry ? (
        <div className="grid max-h-[88vh] lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Pixel-perfect preview ─────────────────────────────────────── */}
          <div
            ref={previewRef}
            className="relative flex h-[46vh] items-center justify-center overflow-hidden bg-void p-6 lg:h-[64vh]"
          >
            <div aria-hidden className="vignette pointer-events-none absolute inset-0" />
            <Image
              key={entry.id}
              src={assetSrc(entry)}
              alt={entry.name}
              width={entry.dimensions?.[0] ?? 1200}
              height={entry.dimensions?.[1] ?? 630}
              sizes="(min-width: 1024px) 60vw, 96vw"
              unoptimized
              className={cn(
                "relative [image-rendering:pixelated]",
                pixelScale === null && "max-h-full max-w-full object-contain"
              )}
              style={
                pixelScale !== null && entry.dimensions
                  ? {
                      width: entry.dimensions[0] * pixelScale,
                      height: entry.dimensions[1] * pixelScale,
                    }
                  : undefined
              }
            />
            <button
              type="button"
              onClick={goPrev}
              disabled={count < 2}
              aria-label="Previous asset"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-gunmetal bg-coal/85 p-2 text-ash transition-colors hover:border-hellfire hover:text-bone disabled:opacity-40"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={count < 2}
              aria-label="Next asset"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-gunmetal bg-coal/85 p-2 text-ash transition-colors hover:border-hellfire hover:text-bone disabled:opacity-40"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-xs text-ash">
              {(index ?? 0) + 1} / {count}
              {pixelScale !== null ? ` · ${pixelScale}×` : null}
            </p>
          </div>

          {/* ── Provenance panel ──────────────────────────────────────────── */}
          <aside
            data-testid="asset-provenance"
            className="relative flex max-h-[42vh] flex-col gap-5 overflow-y-auto border-t border-gunmetal bg-coal p-6 lg:max-h-[64vh] lg:border-l lg:border-t-0"
          >
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close asset details"
              className="absolute right-4 top-4 rounded-md border border-gunmetal bg-void p-1.5 text-ash transition-colors hover:border-hellfire hover:text-bone"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            <div>
              <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
                Provenance
              </p>
              <h2 className="mt-2 pr-8 font-display text-2xl font-bold uppercase leading-none tracking-tight text-bone">
                {entry.name}
              </h2>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-xs">
              <ProvenanceFact label="Kind" value={KIND_SINGULAR[entry.kind]} />
              <ProvenanceFact label="Game" value={game ?? "Cross-game"} />
              <ProvenanceFact label="Faction" value={faction} />
              <ProvenanceFact label="Host family" value={entry.hostFamily ?? null} />
              <ProvenanceFact label="Dimensions" value={dimensions} />
            </dl>

            {entry.kind === "entity-variant" ? (
              <span className="inline-flex w-fit items-center rounded-md border border-rust/70 bg-rust/15 px-2 py-1 font-display text-[11px] font-bold uppercase tracking-widest text-bone">
                palette-locked · DOOM ramp
              </span>
            ) : null}

            {entry.provenance ? (
              <div className="rounded-md border border-gunmetal bg-void p-4">
                <p className="font-display text-[11px] font-bold uppercase tracking-widest text-hellfire">
                  AI provenance
                </p>
                <dl className="mt-3 space-y-2 font-mono text-xs leading-relaxed">
                  <div>
                    <dt className="inline text-ash">tool · </dt>
                    <dd className="inline text-bone">{entry.provenance.tool}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ash">date · </dt>
                    <dd className="inline text-bone">{entry.provenance.date}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ash">kind · </dt>
                    <dd className="inline text-bone">{entry.provenance.kind}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ash">scope · </dt>
                    <dd className="inline text-bone">{entry.provenance.scope}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {entry.promptBase ? (
              <figure>
                <figcaption className="font-display text-[11px] font-bold uppercase tracking-widest text-ash">
                  Prompt base
                </figcaption>
                <blockquote className="mt-2 line-clamp-3 border-l border-hellfire/60 pl-3 font-mono text-xs leading-relaxed text-ash">
                  “{entry.promptBase}”
                </blockquote>
              </figure>
            ) : null}

            {entry.canon ? (
              <p className="text-sm leading-relaxed text-ash">{entry.canon}</p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </dialog>
  );
}

function ProvenanceFact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-ash">{label}</dt>
      <dd className="mt-0.5 capitalize text-bone">{value}</dd>
    </div>
  );
}
