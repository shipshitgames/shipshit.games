import Link from "next/link";

import { accentVars, spriteUrl, type Accent } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Shared tile for characters and creatures. */
export function EntityCard({
  href,
  name,
  kicker,
  tag,
  accent,
  spriteBase,
  className,
}: {
  href: string;
  name: string;
  kicker?: string;
  tag?: string;
  accent: Accent;
  spriteBase: string | null;
  className?: string;
}) {
  const sprite = spriteUrl(spriteBase);
  return (
    <Link
      href={href}
      style={accentVars(accent)}
      className={cn(
        "group relative flex h-56 flex-col justify-end overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--page-accent)] hover:shadow-[0_0_32px_-14px_var(--page-accent)]",
        className
      )}
    >
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_8%,color-mix(in_srgb,var(--page-accent)_20%,transparent),transparent_72%)]" />
        {sprite ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sprite}
            alt={name}
            className="absolute left-1/2 top-5 h-36 -translate-x-1/2 object-contain drop-shadow-[0_8px_24px_color-mix(in_srgb,var(--page-accent)_45%,transparent)] transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="absolute inset-x-0 top-6 select-none text-center font-display text-7xl font-bold text-white/[0.04]">
            {name.charAt(0)}
          </span>
        )}
        <div className="vignette absolute inset-0" />
      </div>

      <div className="relative z-10 p-4">
        {kicker ? (
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[var(--page-accent)]">
            {kicker}
          </p>
        ) : null}
        <h3 className="font-display text-lg font-bold uppercase leading-tight tracking-tight text-bone">
          {name}
        </h3>
        {tag ? <p className="text-xs text-ash">{tag}</p> : null}
      </div>
    </Link>
  );
}
