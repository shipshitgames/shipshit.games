import { cn } from "@/lib/utils";

/** Full-bleed film grain. Render once near the root. */
export function Grain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("grain pointer-events-none fixed inset-0 z-50", className)}
    />
  );
}

/**
 * Layered atmospheric backdrop for a hero/section. Absolutely positioned;
 * tinted by the nearest `--page-accent`.
 */
export function Backdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_srgb,var(--page-accent)_8%,transparent),transparent_60%)]" />
      <div className="bloom-accent absolute inset-x-0 bottom-0 h-2/3" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}
