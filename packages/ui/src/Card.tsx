import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export function Card({ asChild = false, className, children, ...props }: CardProps) {
  if (asChild && children) {
    const child = Children.only(children);

    if (isValidElement<{ className?: string }>(child)) {
      return cloneElement(child as ReactElement<{ className?: string }>, {
        ...props,
        className: cn("ssg-panel", child.props.className, className),
      });
    }
  }

  return (
    <div
      className={cn("ssg-panel", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("ssg-section-heading", className)} {...props} />;
}

export function CardBody({ className, ...props }: CardProps) {
  return <div className={cn("ssg-card-body", className)} {...props} />;
}
