"use client";

import { useEffect, useRef, useState } from "react";

import { trackEvent } from "@/lib/analytics";

const SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
] as const;

const TAKEOVER_MS = 1500;
const BODY_CLASS = "scourge-takeover";

/**
 * Konami code listener (↑↑↓↓←→←→BA). On trigger the Scourge briefly takes
 * over the screen: body gets `.scourge-takeover` for ~1.5s and a toxic
 * overlay flashes. With prefers-reduced-motion the flash is suppressed by
 * CSS — only the text shows. Styles live in globals.css.
 */
export function Konami() {
  const [active, setActive] = useState(false);
  const progress = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === SEQUENCE[progress.current]) {
        progress.current += 1;
        if (progress.current === SEQUENCE.length) {
          progress.current = 0;
          trackEvent("konami");
          setActive(true);
          document.body.classList.add(BODY_CLASS);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            setActive(false);
            document.body.classList.remove(BODY_CLASS);
          }, TAKEOVER_MS);
        }
      } else {
        progress.current = key === SEQUENCE[0] ? 1 : 0;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    // Hydration marker so tests know the listener is live.
    document.body.dataset.konamiReady = "true";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer) clearTimeout(timer);
      document.body.classList.remove(BODY_CLASS);
      delete document.body.dataset.konamiReady;
    };
  }, []);

  if (!active) return null;

  return (
    <output
      data-testid="scourge-takeover"
      aria-live="polite"
      className="scourge-takeover-overlay scanlines fixed inset-0 z-[90] flex items-center justify-center"
    >
      <p className="scourge-takeover-text px-6 text-center font-display text-3xl font-bold uppercase tracking-[0.3em] text-toxic sm:text-5xl">
        The Scourge sees you
      </p>
    </output>
  );
}
