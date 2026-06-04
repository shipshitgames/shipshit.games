import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "stack"
  | "back";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  default: "ssg-button--default",
  primary: "ssg-button--primary",
  secondary: "ssg-button--secondary",
  danger: "ssg-button--danger",
  ghost: "ssg-button--ghost",
  stack: "ssg-button--stack",
  back: "ssg-button--back",
};

const sizes: Record<ButtonSize, string> = {
  sm: "ssg-button--sm",
  md: "ssg-button--md",
  lg: "ssg-button--lg",
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
      className={cn("ssg-button", variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
