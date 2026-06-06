"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Full-bleed film grain. Render once near the root. */
export function Grain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("grain pointer-events-none fixed inset-0 z-50", className)}
    />
  );
}

/**
 * Layered atmospheric backdrop for a hero/section. Absolutely positioned;
 * tinted by the nearest `--page-accent`.
 */
export function Backdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_srgb,var(--page-accent)_8%,transparent),transparent_60%)]" />
      <div className="bloom-accent absolute inset-x-0 bottom-0 h-2/3" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}

type Ember = {
  alpha: number;
  life: number;
  maxLife: number;
  radius: number;
  tint: "blood" | "hellfire" | "bone";
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const COLORS = {
  blood: [193, 18, 31],
  hellfire: [255, 106, 0],
  bone: [233, 227, 214],
} as const;

const makeEmber = (width: number, height: number): Ember => {
  const fromBottom = Math.random() > 0.08;
  const tintRoll = Math.random();

  return {
    alpha: 0,
    life: 0,
    maxLife: 220 + Math.random() * 280,
    radius: 0.6 + Math.random() * 1.6,
    tint: tintRoll > 0.94 ? "bone" : tintRoll > 0.38 ? "hellfire" : "blood",
    vx: (Math.random() - 0.5) * 0.24,
    vy: fromBottom ? -0.14 - Math.random() * 0.46 : -0.03 - Math.random() * 0.14,
    x: Math.random() * width,
    y: fromBottom ? height * (0.68 + Math.random() * 0.34) : Math.random() * height * 0.72,
  };
};

export function EmberParticles({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let embers: Ember[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = width < 640 ? 20 : 38;
      const count = Math.min(64, Math.max(18, Math.round((width * height) / 26000)));
      embers = Array.from({ length: Math.min(density, count) }, () => makeEmber(width, height));
    };

    const drawEmber = (ember: Ember, reducedMotion: boolean) => {
      const [r, g, b] = COLORS[ember.tint];
      const progress = ember.life / ember.maxLife;
      const fadeIn = Math.min(1, progress * 6);
      const fadeOut = Math.max(0, 1 - progress);
      const alpha = ember.alpha || fadeIn * fadeOut * 0.48;
      const radius = reducedMotion ? ember.radius * 0.86 : ember.radius;

      const glow = context.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, radius * 6);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      glow.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${alpha * 0.22})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      context.fillStyle = glow;
      context.beginPath();
      context.arc(ember.x, ember.y, radius * 6, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.82, alpha * 1.1)})`;
      context.beginPath();
      context.arc(ember.x, ember.y, radius, 0, Math.PI * 2);
      context.fill();

      if (!reducedMotion && ember.radius > 1.7) {
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.24})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(ember.x, ember.y);
        context.lineTo(ember.x - ember.vx * 18, ember.y - ember.vy * 18);
        context.stroke();
      }
    };

    const draw = () => {
      const reducedMotion = mediaQuery.matches;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const ember of embers) {
        drawEmber(ember, reducedMotion);

        if (!reducedMotion) {
          ember.life += 1;
          ember.x += ember.vx + Math.sin(ember.life * 0.014) * 0.07;
          ember.y += ember.vy;
          ember.alpha = 0;

          if (
            ember.life > ember.maxLife ||
            ember.x < -40 ||
            ember.x > width + 40 ||
            ember.y < -24
          ) {
            Object.assign(ember, makeEmber(width, height));
          }
        } else {
          ember.alpha = 0.1;
        }
      }

      context.globalCompositeOperation = "source-over";
      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-[1] h-full w-full mix-blend-screen", className)}
    />
  );
}
