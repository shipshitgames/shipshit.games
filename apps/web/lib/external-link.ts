/**
 * Centralized rule for anchor `target`/`rel` based on the href.
 *
 * External links (anything starting with `http`) open in a new tab with
 * `rel="noreferrer"`; internal/relative links get neither attribute (so React
 * omits them). Previously every link card re-derived this inline, per attribute.
 */
export function externalLinkAttrs(href: string): {
  target?: "_blank";
  rel?: "noreferrer";
} {
  return href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {};
}
