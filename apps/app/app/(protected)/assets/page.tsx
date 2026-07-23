"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Archive,
  Loader2,
  Sparkles,
  Download,
  Gamepad2,
  RefreshCw,
  ImageIcon,
  Scissors,
} from "lucide-react";
import { GAMES } from "@shipshitgames/shared";
import { AssetEditPanel } from "@/components/asset-edit-panel";

const POSES = [
  "idle",
  "attacking",
  "running",
  "jumping",
  "side view",
  "back view",
] as const;
const BATCH_SIZES = [1, 2, 3, 4] as const;
const PENDING_GENERATION_KEY = "shipshitgames:pending-generation:v1";
const RESUME_POLL_MS = 30_000;
const MAX_RESUME_POLLS = 20;
const chip = (active: boolean) =>
  `rounded-md border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${
    active
      ? "border-hellfire text-hellfire"
      : "border-gunmetal text-ash hover:border-hellfire/50 hover:text-bone"
  }`;

interface AssetRecord {
  id: string;
  subject: string;
  description: string | null;
  fullPrompt: string;
  style: string | null;
  pose: string | null;
  sheetPoses: string[] | null;
  gameSlug: string | null;
  game: string | null;
  parentId: string | null;
  sourceId: string | null;
  editInstruction: string | null;
  sliceIndex: number | null;
  url: string;
  createdAt: string;
}

interface PendingGeneration {
  body: Record<string, unknown>;
  expected: number;
  idempotencyKey: string;
}

function safeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "asset"
  );
}

function mergeAssets(
  current: AssetRecord[],
  incoming: AssetRecord[],
): AssetRecord[] {
  const byId = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of incoming) byId.set(asset.id, asset);
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export default function AssetsPage() {
  const resumedPendingGeneration = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [sheet, setSheet] = useState(false);
  const [pose, setPose] = useState<string>(POSES[0]);
  const [batch, setBatch] = useState<number>(1);
  const [gameSlug, setGameSlug] = useState<string>(GAMES[0]?.slug ?? "");
  const [pending, setPending] = useState(0);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [slicingId, setSlicingId] = useState<string | null>(null);
  const [zippingId, setZippingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [variantPose, setVariantPose] = useState<Record<string, string>>({});

  const busy = pending > 0;
  const topLevelAssets = useMemo(
    () => assets.filter((asset) => !asset.parentId),
    [assets],
  );
  const framesByParent = useMemo(() => {
    const grouped: Record<string, AssetRecord[]> = {};
    for (const asset of assets) {
      if (!asset.parentId) continue;
      grouped[asset.parentId] ??= [];
      grouped[asset.parentId].push(asset);
    }
    for (const frames of Object.values(grouped)) {
      frames.sort((a, b) => (a.sliceIndex ?? 0) - (b.sliceIndex ?? 0));
    }
    return grouped;
  }, [assets]);

  useEffect(() => {
    fetch("/api/assets/list")
      .then((r) => r.json())
      .then((j) => setAssets(j.assets ?? []))
      .catch(() => {});
  }, []);

  const callGenerate = useCallback(
    async (
      body: Record<string, unknown>,
      expected: number,
      existingIdempotencyKey?: string,
    ): Promise<boolean> => {
      setPending(expected);
      setError(null);
      const idempotencyKey = existingIdempotencyKey ?? crypto.randomUUID();
      localStorage.setItem(
        PENDING_GENERATION_KEY,
        JSON.stringify({
          body,
          expected,
          idempotencyKey,
        } satisfies PendingGeneration),
      );
      let keepPending = false;
      try {
        for (let attempt = 0; attempt < MAX_RESUME_POLLS; attempt += 1) {
          let res: Response;
          try {
            res = await fetch("/api/assets/generate", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "idempotency-key": idempotencyKey,
              },
              body: JSON.stringify(body),
            });
          } catch {
            keepPending = true;
            await new Promise((resolve) => setTimeout(resolve, RESUME_POLL_MS));
            continue;
          }
          if (!res.ok) {
            throw new Error(`Request failed (${res.status})`);
          }
          let json: Record<string, unknown>;
          try {
            json = (await res.json()) as Record<string, unknown>;
          } catch {
            keepPending = true;
            await new Promise((resolve) => setTimeout(resolve, RESUME_POLL_MS));
            continue;
          }
          if (res.status === 202) {
            keepPending = true;
            await new Promise((resolve) => setTimeout(resolve, RESUME_POLL_MS));
            continue;
          }
          keepPending = false;
          const generatedAssets = Array.isArray(json.assets)
            ? (json.assets as AssetRecord[])
            : [];
          const generationErrors = Array.isArray(json.errors)
            ? json.errors.map(String)
            : [];
          setAssets((prev) => mergeAssets(prev, generatedAssets));
          if (generationErrors.length) {
            setError(
              `${generationErrors.length} of ${expected} renders failed: ${generationErrors[0]}`,
            );
          }
          return true;
        }
        keepPending = true;
        throw new Error(
          "Generation is still processing. This page will resume it on your next visit.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed");
        return false;
      } finally {
        if (!keepPending) localStorage.removeItem(PENDING_GENERATION_KEY);
        setPending(0);
      }
    },
    [],
  );

  useEffect(() => {
    if (resumedPendingGeneration.current) return;
    resumedPendingGeneration.current = true;
    try {
      const pending = JSON.parse(
        localStorage.getItem(PENDING_GENERATION_KEY) ?? "null",
      ) as PendingGeneration | null;
      if (pending?.body && pending.expected && pending.idempotencyKey) {
        void callGenerate(
          pending.body,
          pending.expected,
          pending.idempotencyKey,
        );
      }
    } catch {
      localStorage.removeItem(PENDING_GENERATION_KEY);
    }
  }, [callGenerate]);

  async function generate() {
    if (!prompt.trim() || busy) return;
    await callGenerate(
      {
        prompt: prompt.trim(),
        description: description.trim() || undefined,
        pose: sheet ? undefined : pose,
        sheet,
        gameSlug,
        count: batch,
      },
      batch,
    );
  }

  async function regenerate(asset: AssetRecord) {
    if (busy) return;
    setRegeneratingId(asset.id);
    try {
      await callGenerate(
        {
          prompt: asset.subject,
          description: asset.description ?? undefined,
          pose: asset.sheetPoses
            ? undefined
            : (variantPose[asset.id] ?? asset.pose ?? undefined),
          sheet: Boolean(asset.sheetPoses),
          gameSlug: asset.gameSlug ?? gameSlug,
          sourceId: asset.id,
          count: 1,
        },
        1,
      );
    } finally {
      setRegeneratingId(null);
    }
  }

  function openEditor(asset: AssetRecord) {
    if (busy) return;
    setEditingId(asset.id);
  }

  async function editAsset(
    asset: AssetRecord,
    instruction: string,
    count: number,
  ): Promise<boolean> {
    if (!instruction || busy) return false;
    return callGenerate(
      {
        prompt: asset.subject,
        description: asset.description ?? undefined,
        pose: asset.sheetPoses ? undefined : (asset.pose ?? undefined),
        sheet: Boolean(asset.sheetPoses),
        gameSlug: asset.gameSlug ?? gameSlug,
        sourceId: asset.id,
        editInstruction: instruction,
        count,
      },
      count,
    );
  }

  async function sliceSheet(asset: AssetRecord) {
    if (!asset.sheetPoses?.length || slicingId) return;
    setSlicingId(asset.id);
    setError(null);
    try {
      const res = await fetch("/api/assets/slice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? `Slice failed (${res.status})`);
      setAssets((prev) => mergeAssets(prev, json.assets ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Slice failed");
    } finally {
      setSlicingId(null);
    }
  }

  async function downloadFramesZip(asset: AssetRecord, frames: AssetRecord[]) {
    if (!frames.length || zippingId) return;
    setZippingId(asset.id);
    setError(null);
    try {
      const res = await fetch("/api/assets/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: frames.map((frame) => frame.id) }),
      });
      if (!res.ok) {
        const json = await res
          .json()
          .catch(() => ({ error: `Zip failed (${res.status})` }));
        throw new Error(json.error ?? `Zip failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(asset.subject)}-frames.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zip download failed");
    } finally {
      setZippingId(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-16">
      <section className="mx-auto max-w-7xl">
        <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-hellfire">
          Asset Lab
        </p>
        <h1 className="text-glow mt-4 font-display text-4xl font-bold uppercase leading-[0.95] text-bone sm:text-6xl">
          Generate game sprites.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ash">
          Nano Banana 2 renders through Replicate using the studio art bible,
          framed for the selected game. Reprints reuse the original image so the
          character stays consistent.
        </p>

        <div className="mt-10 rounded-md border border-gunmetal bg-coal p-6">
          <p className="font-display text-xs font-bold uppercase tracking-widest text-ash">
            Game
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {GAMES.map((g) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setGameSlug(g.slug)}
                title={`${g.genre} — ${g.faction}`}
                className={chip(gameSlug === g.slug)}
              >
                {g.title}
              </button>
            ))}
          </div>
          {gameSlug && (
            <p className="mt-3 text-xs leading-relaxed text-ash/70">
              {GAMES.find((g) => g.slug === gameSlug)?.summary}
            </p>
          )}
          <label
            htmlFor="sprite-prompt"
            className="mt-6 block font-display text-xs font-bold uppercase tracking-widest text-ash"
          >
            Sprite description
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="sprite-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="a swarm ripper enemy"
              className="flex-1 rounded-md border border-gunmetal bg-void px-4 py-3 text-bone placeholder:text-ash/50 focus:border-hellfire focus:outline-none"
            />
            <button
              type="button"
              onClick={generate}
              disabled={busy || !prompt.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone shadow-ember hover:bg-blood-hot disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              {busy ? "Rendering…" : `Generate${batch > 1 ? ` ×${batch}` : ""}`}
            </button>
          </div>
          <label
            htmlFor="sprite-description"
            className="mt-4 block font-display text-xs font-bold uppercase tracking-widest text-ash"
          >
            Character design{" "}
            <span className="text-ash/50">(keeps renders consistent)</span>
          </label>
          <textarea
            id="sprite-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="hulking quadruped, bone-plated skull, twin bile cannons grafted to its back, rusted iron harness, toxic green breach core in the chest"
            className="mt-2 w-full rounded-md border border-gunmetal bg-void px-4 py-3 text-sm text-bone placeholder:text-ash/40 focus:border-hellfire focus:outline-none"
          />
          <div className="mt-4 flex flex-wrap gap-8">
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-widest text-ash">
                Mode
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSheet(false)}
                  className={chip(!sheet)}
                >
                  single
                </button>
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className={chip(sheet)}
                >
                  1×4 pose sheet
                </button>
              </div>
            </div>
            {!sheet && (
              <div>
                <p className="font-display text-xs font-bold uppercase tracking-widest text-ash">
                  Pose
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {POSES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPose(p)}
                      className={chip(pose === p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-widest text-ash">
                Batch
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BATCH_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBatch(n)}
                    className={chip(batch === n)}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-md border border-blood/50 bg-blood/10 px-4 py-3 text-sm text-bone">
              {error}
            </p>
          )}
        </div>

        <h2 className="mt-14 font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Gallery
          <span className="ml-3 text-sm font-normal normal-case tracking-normal text-ash">
            {topLevelAssets.length} asset
            {topLevelAssets.length === 1 ? "" : "s"}
          </span>
        </h2>
        {topLevelAssets.length === 0 && !busy ? (
          <p className="mt-4 text-sm text-ash/70">
            Nothing generated yet. Render your first sprite above.
          </p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: pending }, (_, i) => (
              <div
                key={`pending-${i}`}
                className="flex flex-col overflow-hidden rounded-md border border-hellfire/40 bg-coal"
              >
                <div className="flex aspect-square w-full animate-pulse items-center justify-center bg-void">
                  <div className="flex flex-col items-center gap-3 text-ash">
                    <Loader2
                      className="size-8 animate-spin text-hellfire"
                      aria-hidden="true"
                    />
                    <span className="font-display text-xs font-bold uppercase tracking-widest">
                      Rendering…
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-4 text-xs text-ash/70">
                  <ImageIcon className="size-3.5" aria-hidden="true" />
                  Nano Banana 2 is painting
                </div>
              </div>
            ))}
            {topLevelAssets.map((asset) => {
              const frames = framesByParent[asset.id] ?? [];
              const expectedFrames = asset.sheetPoses?.length ?? 0;

              return (
                <figure
                  key={asset.id}
                  className="flex flex-col overflow-hidden rounded-md border border-gunmetal bg-coal"
                >
                  <div
                    className={`relative w-full bg-void ${
                      asset.sheetPoses ? "aspect-[21/9]" : "aspect-square"
                    }`}
                  >
                    <Image
                      src={asset.url}
                      alt={asset.subject}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                  <figcaption className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {asset.sheetPoses && (
                        <span className="rounded-md border border-hellfire/50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-hellfire">
                          1×{asset.sheetPoses.length} sheet
                        </span>
                      )}
                      {asset.game && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-hellfire/50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-hellfire">
                          <Gamepad2 className="size-3" aria-hidden="true" />
                          {asset.game}
                        </span>
                      )}
                      {asset.pose && (
                        <span className="rounded-md border border-gunmetal px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-ash">
                          {asset.pose}
                        </span>
                      )}
                      {asset.editInstruction && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-blood-hot/60 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-bone">
                          <Sparkles className="size-3" aria-hidden="true" />
                          Edited variant
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-ash">
                      {asset.subject}
                    </p>
                    {asset.editInstruction && (
                      <p className="rounded-md border border-gunmetal/70 bg-void/60 px-3 py-2 text-xs leading-relaxed text-ash">
                        <span className="font-bold text-bone">Edit:</span>{" "}
                        {asset.editInstruction}
                      </p>
                    )}
                    {frames.length > 0 && (
                      <div className="rounded-md border border-gunmetal/70 bg-void/60 p-2">
                        <div className="grid grid-cols-4 gap-2">
                          {frames.map((frame, index) => (
                            <a
                              key={frame.id}
                              href={frame.url}
                              download={`${safeFileName(frame.subject)}.webp`}
                              className="group relative aspect-square overflow-hidden rounded-md border border-gunmetal bg-void"
                              aria-label={`Download frame ${index + 1}`}
                            >
                              <Image
                                src={frame.url}
                                alt={frame.subject}
                                fill
                                sizes="80px"
                                unoptimized
                                className="object-contain"
                              />
                              <span className="absolute bottom-1 left-1 rounded bg-coal/90 px-1.5 py-0.5 text-[10px] font-bold text-ash">
                                {frame.pose ?? index + 1}
                              </span>
                              <Download
                                className="absolute right-1 top-1 size-3.5 text-ash opacity-0 group-hover:opacity-100"
                                aria-hidden="true"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-gunmetal/60 pt-3">
                      {!asset.sheetPoses && (
                        <select
                          value={
                            variantPose[asset.id] ?? asset.pose ?? POSES[0]
                          }
                          onChange={(e) =>
                            setVariantPose((prev) => ({
                              ...prev,
                              [asset.id]: e.target.value,
                            }))
                          }
                          aria-label="Pose for reprint"
                          className="flex-1 rounded-md border border-gunmetal bg-void px-2 py-1.5 text-xs text-bone focus:border-hellfire focus:outline-none"
                        >
                          {POSES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      )}
                      {asset.sheetPoses && (
                        <button
                          type="button"
                          onClick={() => sliceSheet(asset)}
                          disabled={Boolean(slicingId)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gunmetal px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {slicingId === asset.id ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Scissors className="size-3.5" aria-hidden="true" />
                          )}
                          {frames.length >= expectedFrames
                            ? "Frames ready"
                            : "Slice frames"}
                        </button>
                      )}
                      {frames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => downloadFramesZip(asset, frames)}
                          disabled={Boolean(zippingId)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gunmetal px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {zippingId === asset.id ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Archive className="size-3.5" aria-hidden="true" />
                          )}
                          Zip
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          editingId === asset.id
                            ? setEditingId(null)
                            : openEditor(asset)
                        }
                        disabled={busy}
                        aria-expanded={editingId === asset.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gunmetal px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerate(asset)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gunmetal px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {regeneratingId === asset.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                        )}
                        Reprint
                      </button>
                      <a
                        href={asset.url}
                        download={`${safeFileName(asset.subject)}.png`}
                        className="shrink-0 text-ash hover:text-hellfire"
                        aria-label="Download sprite"
                      >
                        <Download className="size-4" aria-hidden="true" />
                      </a>
                    </div>
                    {editingId === asset.id && (
                      <AssetEditPanel
                        busy={busy}
                        onCancel={() => setEditingId(null)}
                        onSubmit={(instruction, count) =>
                          editAsset(asset, instruction, count)
                        }
                      />
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
