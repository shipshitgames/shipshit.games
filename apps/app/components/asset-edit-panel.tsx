"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const EDIT_BATCH_SIZES = [1, 2, 3, 4] as const;

type AssetEditPanelProps = {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (instruction: string, count: number) => Promise<boolean>;
};

function batchChip(active: boolean): string {
  return `rounded-md border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${
    active
      ? "border-hellfire text-hellfire"
      : "border-gunmetal text-ash hover:border-hellfire/50 hover:text-bone"
  }`;
}

export function AssetEditPanel({
  busy,
  onCancel,
  onSubmit,
}: AssetEditPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [batch, setBatch] = useState<number>(1);

  async function submit() {
    const normalized = instruction.trim();
    if (!normalized || busy) return;
    if (await onSubmit(normalized, batch)) onCancel();
  }

  return (
    <div className="rounded-md border border-hellfire/40 bg-void/70 p-3">
      <label
        htmlFor="asset-edit-instruction"
        className="font-display text-[10px] font-bold uppercase tracking-widest text-ash"
      >
        What should change?
      </label>
      <textarea
        id="asset-edit-instruction"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        rows={2}
        maxLength={500}
        placeholder="add shoulder armor; keep everything else identical"
        className="mt-2 w-full rounded-md border border-gunmetal bg-coal px-3 py-2 text-xs text-bone placeholder:text-ash/40 focus:border-hellfire focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-ash">
            Variants
          </span>
          {EDIT_BATCH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBatch(size)}
              className={batchChip(batch === size)}
            >
              ×{size}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !instruction.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-blood px-3 py-2 text-xs font-bold uppercase tracking-widest text-bone hover:bg-blood-hot disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-3.5" aria-hidden="true" />
          )}
          {busy ? "Editing…" : `Apply${batch > 1 ? ` ×${batch}` : ""}`}
        </button>
      </div>
    </div>
  );
}
