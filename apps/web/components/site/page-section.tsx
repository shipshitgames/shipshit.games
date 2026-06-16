import type { ReactNode } from "react";

import type { AccentToken } from "@/lib/content/types";
import { pageAccent } from "@/components/games/accent";
import { Backdrop } from "@/components/site/atmosphere";

/**
 * Shared `<section>` shell for the marketing pages. Centralizes the three
 * things every section repeated by hand: the accent style wiring
 * (`--page-accent`), the optional full-bleed illustration, and the optional
 * `Backdrop`, in their canonical render order.
 *
 * `className` is supplied verbatim by each caller rather than defaulted, so the
 * extraction is provably inert — section padding, borders, and `scroll-mt`
 * stay byte-identical to the pre-refactor inline markup.
 */
export function PageSection({
  accent,
  id,
  className,
  illustration,
  backdrop = false,
  children,
}: {
  accent: AccentToken;
  id?: string;
  className: string;
  /** A `<SectionIllustration />`, rendered first so it sits behind content. */
  illustration?: ReactNode;
  /** Render the shared `Backdrop` after the illustration. */
  backdrop?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} style={pageAccent(accent)} className={className}>
      {illustration}
      {backdrop ? <Backdrop /> : null}
      {children}
    </section>
  );
}
