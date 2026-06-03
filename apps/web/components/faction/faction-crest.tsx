import { accentVars, type Accent } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Abstract faction sigil tinted by accent — placeholder emblem until key art lands. */
export function FactionCrest({
  accent,
  className,
}: {
  accent: Accent;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      style={accentVars(accent)}
      className={cn("text-[var(--page-accent)]", className)}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="50" cy="50" r="44" strokeWidth="1.25" opacity="0.35" />
      <circle
        cx="50"
        cy="50"
        r="34"
        strokeWidth="1"
        opacity="0.25"
        strokeDasharray="5 11"
      />
      <path d="M50 16 L76 66 L50 53 L24 66 Z" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 41 L50 86" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="3.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
