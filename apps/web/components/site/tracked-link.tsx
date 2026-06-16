"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, MouseEvent, Ref } from "react";

import { externalLinkAttrs } from "@/lib/external-link";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";

export interface TrackedLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> {
  href: string;
  /** Funnel event fired on click (#32). */
  event: AnalyticsEventName;
  /** Optional props attached to the event (e.g. `{ location, videoId }`). */
  eventProps?: Record<string, string>;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** React 19 passes refs as a regular prop — forwarded so `<Button asChild>` works. */
  ref?: Ref<HTMLAnchorElement>;
}

/**
 * Anchor that reports a funnel event on click and then behaves like a normal
 * link. The single seam for analytics-instrumented links so call sites stay
 * declarative (`<TrackedLink event="video_click" .../>`) instead of repeating
 * the `onClick={() => trackEvent(...)}` glue.
 *
 * External hrefs (`http…`) render a plain `<a>` with the shared
 * {@link externalLinkAttrs} `target`/`rel`; internal hrefs render a Next.js
 * `<Link>` to preserve client-side navigation. Accepting `ref` as a prop (the
 * React 19 pattern) and spreading the rest keep it usable as a
 * `<Button asChild>` child.
 */
export function TrackedLink({
  href,
  event,
  eventProps,
  onClick,
  children,
  ref,
  ...rest
}: TrackedLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    trackEvent(event, eventProps);
    onClick?.(e);
  }

  if (href.startsWith("http")) {
    return (
      <a
        ref={ref}
        href={href}
        {...externalLinkAttrs(href)}
        {...rest}
        onClick={handleClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link ref={ref} href={href} {...rest} onClick={handleClick}>
      {children}
    </Link>
  );
}
