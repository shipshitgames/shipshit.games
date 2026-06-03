import { cloneElement, isValidElement, type HTMLAttributes, type ReactElement } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

const baseCard = "ssg-panel";

export function Card({ className, asChild = false, children, ...props }: CardProps) {
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...props,
      className: cn(baseCard, child.props.className, className),
    });
  }

  return (
    <div
      className={cn(baseCard, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "ssg-card-title",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: CardProps) {
  return <div className={cn("ssg-card-body", className)} {...props} />;
}
