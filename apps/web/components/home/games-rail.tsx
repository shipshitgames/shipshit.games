"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal scroller for the home games rail. Native touch scrolling alone
 * is undiscoverable on desktop (vertical wheel scrolls the page, macOS hides
 * scrollbars), so this adds chevrons, wheel translation, and drag-to-scroll.
 */
export function GamesRail({ children }: { children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateChevrons = () => {
      setCanScroll({
        left: rail.scrollLeft > 4,
        right: rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 4,
      });
    };
    updateChevrons();
    rail.addEventListener("scroll", updateChevrons, { passive: true });
    const resize = new ResizeObserver(updateChevrons);
    resize.observe(rail);

    // Vertical wheel over the rail scrolls it horizontally. Must be a native
    // non-passive listener — React's synthetic wheel handler cannot preventDefault.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const atStart = rail.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1 && event.deltaY > 0;
      if (atStart || atEnd) return; // let the page take over at the edges
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    };
    rail.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      rail.removeEventListener("scroll", updateChevrons);
      rail.removeEventListener("wheel", onWheel);
      resize.disconnect();
    };
  }, []);

  // Mouse drag-to-scroll; a small threshold keeps card clicks working.
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return; // touch already scrolls natively
    const rail = railRef.current;
    if (!rail) return;
    drag.current = { active: true, startX: event.clientX, startScroll: rail.scrollLeft, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const rail = railRef.current;
    if (!rail || !drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    if (Math.abs(dx) > 6) {
      // Capture only once it is clearly a drag, so plain clicks stay native.
      if (!drag.current.moved) rail.setPointerCapture(event.pointerId);
      drag.current.moved = true;
      rail.scrollLeft = drag.current.startScroll - dx;
    }
  };
  const endDrag = () => {
    drag.current.active = false;
  };
  const onClickCapture = (event: React.MouseEvent) => {
    if (drag.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      drag.current.moved = false;
    }
  };

  const page = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  const chevronClass =
    "absolute top-1/2 z-10 -translate-y-1/2 border border-gunmetal bg-coal/90 p-2 text-bone transition-colors hover:border-hellfire hover:text-hellfire disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll games left"
        disabled={!canScroll.left}
        onClick={() => page(-1)}
        className={`${chevronClass} -left-3`}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <div
        ref={railRef}
        data-testid="games-rail"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(event) => event.preventDefault()}
        className="flex cursor-grab snap-x snap-proximity gap-4 overflow-x-auto pb-3 active:cursor-grabbing [touch-action:pan-x_pan-y]"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll games right"
        disabled={!canScroll.right}
        onClick={() => page(1)}
        className={`${chevronClass} -right-3`}
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
