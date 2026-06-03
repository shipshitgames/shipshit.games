import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#ff2d95]/20 bg-[#0a0a0f]/80 p-5 text-zinc-100 " +
          "transition-colors duration-150 hover:border-[#ff2d95]/60",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-bold uppercase tracking-wide text-[#ff2d95]",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: CardProps) {
  return <div className={cn("mt-2 text-sm text-zinc-400", className)} {...props} />;
}
