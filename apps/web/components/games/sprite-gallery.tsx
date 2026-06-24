import Image from "next/image";

import { assetSrc } from "@/components/assets/asset-meta";
import { Eyebrow } from "@/components/site/eyebrow";
import { accentStyle } from "@/components/games/accent";
import type { AccentToken, AssetIndexEntry } from "@/lib/content/types";

/** Production asset grid from the committed asset index. Omitted when empty. */
export function SpriteGallery({
  assets,
  accent,
}: {
  assets: AssetIndexEntry[];
  accent: AccentToken;
}) {
  if (assets.length === 0) return null;

  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Production assets</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Shipped pixels, not concept art.
            </h2>
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-ash">
            {assets.length} assets in the catalog
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {assets.map((asset) => (
            <figure
              key={asset.id}
              className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition-colors duration-300 hover:border-[var(--accent)]"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden border-b border-gunmetal/60 bg-void p-3">
                <Image
                  src={assetSrc(asset)}
                  alt={`${asset.name} pixel art asset`}
                  width={asset.dimensions?.[0] ?? 160}
                  height={asset.dimensions?.[1] ?? 160}
                  className="max-h-full w-auto object-contain [image-rendering:pixelated] transition duration-500 group-hover:scale-105"
                />
              </div>
              <figcaption className="px-3 py-2">
                <span className="block truncate font-display text-xs font-bold uppercase tracking-widest text-bone">
                  {asset.name}
                </span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ash">
                  {asset.kind}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
