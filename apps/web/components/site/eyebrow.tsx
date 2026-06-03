import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-display text-xs font-bold uppercase tracking-[0.35em] text-[var(--page-accent)]",
        className
      )}
    >
      {children}
    </p>
  );
}
