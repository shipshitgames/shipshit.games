import Link from "next/link";

import { breadcrumbJsonLd, jsonLdString, type BreadcrumbItem } from "@/lib/seo";

/** Industrial breadcrumb trail with BreadcrumbList JSON-LD. Last item is the current page. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <script type="application/ld+json">
        {jsonLdString(breadcrumbJsonLd(items))}
      </script>
      <ol className="flex flex-wrap items-center gap-2 font-display text-xs font-bold uppercase tracking-widest">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-2">
              {index > 0 ? <span className="text-gunmetal">/</span> : null}
              {isLast ? (
                <span aria-current="page" className="text-bone">
                  {item.name}
                </span>
              ) : (
                <Link href={item.href} className="text-ash transition-colors hover:text-bone">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
