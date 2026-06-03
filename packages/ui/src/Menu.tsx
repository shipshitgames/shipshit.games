import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function MenuScreen({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ssg-menu-screen", className)} {...props} />;
}

export function MenuPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ssg-menu-panel", className)} {...props} />;
}

export function MenuTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("ssg-menu-title", className)} {...props} />;
}

export function MenuKicker({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ssg-menu-kicker", className)} {...props} />;
}

export function MenuStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ssg-menu-stack", className)} {...props} />;
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

export function MenuItem({ className, icon, title, description, children, type = "button", ...props }: MenuItemProps) {
  return (
    <button type={type} className={cn("ssg-menu-item", className)} {...props}>
      {icon ? <span className="ssg-menu-item__icon">{icon}</span> : null}
      <span className="ssg-menu-item__copy">
        <b>{title}</b>
        {description ? <small>{description}</small> : null}
        {children}
      </span>
    </button>
  );
}

export interface UpgradeCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
}

export function UpgradeCard({ className, icon, title, meta, description, children, type = "button", ...props }: UpgradeCardProps) {
  return (
    <button type={type} className={cn("ssg-upgrade-card", className)} {...props}>
      {icon ? <span className="ssg-upgrade-card__icon">{icon}</span> : null}
      <b>{title}</b>
      {meta ? <small>{meta}</small> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </button>
  );
}
