/**
 * Whether `href` points off-site and should render as a plain `<a>` instead of
 * a Next.js `<Link>`.
 *
 * Matches absolute `http://`/`https://` URLs and protocol-relative `//host`
 * ones. Deliberately *not* a loose `startsWith("http")`: that misclassified
 * relative hrefs literally beginning with "http" (e.g. `httpfoo`) as external
 * and missed protocol-relative URLs. `mailto:`/`tel:` are external for routing
 * purposes (plain `<a>`) but handled separately so they skip `target=_blank`.
 */
export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//.test(href);
}

/**
 * Centralized rule for anchor `target`/`rel` based on the href.
 *
 * External web links (`http://`, `https://`, `//host`) open in a new tab with
 * `rel="noreferrer"`; internal/relative links — and `mailto:`/`tel:` — get
 * neither attribute (so React omits them). Previously every link card
 * re-derived this inline, per attribute.
 */
export function externalLinkAttrs(href: string): {
  target?: "_blank";
  rel?: "noreferrer";
} {
  return isExternalHref(href) ? { target: "_blank", rel: "noreferrer" } : {};
}
