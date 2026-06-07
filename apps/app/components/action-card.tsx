import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type ActionCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
};

export function ActionCard({ href, icon: Icon, title, body, cta }: ActionCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-gunmetal bg-coal p-5 transition-colors hover:border-hellfire"
    >
      <Icon className="size-5 text-hellfire" aria-hidden="true" />
      <h2 className="mt-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
        {title}
      </h2>
      <p className="mt-2 min-h-16 text-sm leading-relaxed text-ash">{body}</p>
      <p className="mt-4 font-display text-xs font-bold uppercase tracking-widest text-hellfire">
        {cta}
      </p>
    </Link>
  );
}
