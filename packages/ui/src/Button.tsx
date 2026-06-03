import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-bold uppercase tracking-wide " +
  "transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff] " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[#ff2d95] text-[#0a0a0f] hover:bg-[#ff2d95]/90 shadow-[0_0_20px_rgba(255,45,149,0.5)]",
  secondary:
    "bg-[#00e5ff] text-[#0a0a0f] hover:bg-[#00e5ff]/90 shadow-[0_0_20px_rgba(0,229,255,0.5)]",
  ghost:
    "bg-transparent text-[#00e5ff] border border-[#00e5ff]/40 hover:border-[#00e5ff] hover:bg-[#00e5ff]/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
