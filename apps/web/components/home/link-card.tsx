import { externalLinkAttrs } from "@/lib/external-link";

/**
 * Anchor card used by the home "Studio output" section. Merges the two
 * near-identical card variants that used to be hand-written twice:
 *
 * - `lg` — the products grid: `<h3>` title, heavier padding, accent glow on hover.
 * - `md` — the tool-access grid: `<span>` title, lighter padding, border-only hover.
 *
 * External vs internal `target`/`rel` is derived once via {@link externalLinkAttrs}
 * instead of re-checked per attribute.
 */
export function LinkCard({
  href,
  title,
  desc,
  cta,
  size,
}: {
  href: string;
  title: string;
  desc: string;
  cta: string;
  size: "lg" | "md";
}) {
  const link = externalLinkAttrs(href);

  if (size === "lg") {
    return (
      <a
        href={href}
        {...link}
        className="group flex flex-col rounded-md border border-gunmetal bg-coal p-7 transition-all duration-300 hover:border-hellfire hover:shadow-[0_0_40px_-16px_var(--page-accent)]"
      >
        <h3 className="font-display text-xl font-bold uppercase tracking-tight text-bone">
          {title}
        </h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-ash">{desc}</p>
        <span className="mt-5 font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors group-hover:text-blood">
          {cta} →
        </span>
      </a>
    );
  }

  return (
    <a
      href={href}
      {...link}
      className="group flex flex-col rounded-md border border-gunmetal bg-coal/90 p-5 transition-colors hover:border-hellfire"
    >
      <span className="block font-display text-lg font-bold uppercase tracking-tight text-bone">
        {title}
      </span>
      <span className="mt-2 block flex-1 text-sm leading-relaxed text-ash">{desc}</span>
      <span className="mt-4 font-display text-xs font-bold uppercase tracking-widest text-hellfire group-hover:text-blood">
        {cta} →
      </span>
    </a>
  );
}
