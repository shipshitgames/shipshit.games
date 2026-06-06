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
  heat: number;
  life: number;
  maxLife: number;
  radius: number;
  spark: boolean;
  tint: "blood" | "coal" | "hellfire" | "whiteHot";
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const COLORS = {
  blood: [193, 18, 31],
  coal: [92, 18, 11],
  hellfire: [255, 106, 0],
  whiteHot: [255, 188, 96],
} as const;

type EmberIntensity = "hero" | "firefront";

const makeEmber = (width: number, height: number, intensity: EmberIntensity): Ember => {
  const strong = intensity === "firefront";
  const fromBottom = Math.random() > (strong ? 0.04 : 0.12);
  const tintRoll = Math.random();
  const heat = strong ? 0.7 + Math.random() * 0.55 : 0.45 + Math.random() * 0.4;

  return {
    alpha: 0,
    heat,
    life: 0,
    maxLife: (strong ? 150 : 210) + Math.random() * (strong ? 190 : 260),
    radius: (strong ? 0.95 : 0.65) + Math.random() * (strong ? 2.6 : 1.7),
    spark: Math.random() > (strong ? 0.74 : 0.84),
    tint:
      tintRoll > 0.985
        ? "whiteHot"
        : tintRoll > 0.5
          ? "hellfire"
          : tintRoll > 0.14
            ? "blood"
            : "coal",
    vx: (Math.random() - 0.5) * (strong ? 0.52 : 0.3),
    vy: fromBottom
      ? -0.32 - Math.random() * (strong ? 1.05 : 0.62)
      : -0.08 - Math.random() * 0.2,
    x: Math.random() * width,
    y: fromBottom ? height * (0.74 + Math.random() * 0.3) : Math.random() * height * 0.8,
  };
};

export function EmberParticles({
  className,
  intensity = "hero",
}: {
  className?: string;
  intensity?: EmberIntensity;
}) {
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

      const strong = intensity === "firefront";
      const density = width < 640 ? (strong ? 58 : 34) : strong ? 110 : 64;
      const areaFactor = strong ? 9000 : 17000;
      const count = Math.min(density, Math.max(strong ? 42 : 26, Math.round((width * height) / areaFactor)));
      embers = Array.from({ length: count }, () => makeEmber(width, height, intensity));
    };

    const drawEmber = (ember: Ember, reducedMotion: boolean) => {
      const [r, g, b] = COLORS[ember.tint];
      const progress = ember.life / ember.maxLife;
      const fadeIn = Math.min(1, progress * 6);
      const fadeOut = Math.max(0, 1 - progress);
      const alpha = ember.alpha || fadeIn * fadeOut * 0.58 * ember.heat;
      const radius = reducedMotion ? ember.radius * 0.86 : ember.radius;

      const glow = context.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, radius * 8);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      glow.addColorStop(0.32, `rgba(${r}, ${g}, ${b}, ${alpha * 0.26})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      context.fillStyle = glow;
      context.beginPath();
      context.arc(ember.x, ember.y, radius * 8, 0, Math.PI * 2);
      context.fill();

      if (!reducedMotion && ember.spark) {
        const tail = Math.max(5, radius * 5 + Math.abs(ember.vy) * 12);
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.32})`;
        context.lineWidth = Math.max(0.6, radius * 0.38);
        context.beginPath();
        context.moveTo(ember.x, ember.y);
        context.lineTo(
          ember.x - ember.vx * 24 + Math.sin(ember.life * 0.05) * 2,
          ember.y + tail
        );
        context.stroke();
      }

      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.9, alpha * 1.22)})`;
      context.beginPath();
      context.arc(ember.x, ember.y, radius, 0, Math.PI * 2);
      context.fill();

    };

    let frame = 0;

    const drawFireWash = () => {
      const strong = intensity === "firefront";
      const wash = context.createLinearGradient(0, height * 0.62, 0, height);
      wash.addColorStop(0, "rgba(255, 106, 0, 0)");
      wash.addColorStop(0.58, strong ? "rgba(193, 18, 31, 0.12)" : "rgba(193, 18, 31, 0.045)");
      wash.addColorStop(1, strong ? "rgba(255, 106, 0, 0.24)" : "rgba(255, 106, 0, 0.09)");
      context.fillStyle = wash;
      context.fillRect(0, 0, width, height);

      const sources = strong ? [0.14, 0.32, 0.52, 0.72, 0.9] : [0.22, 0.5, 0.78];
      for (let index = 0; index < sources.length; index += 1) {
        const x = width * sources[index];
        const flicker = 0.85 + Math.sin(frame * 0.035 + index * 1.7) * 0.12;
        const flame = context.createRadialGradient(
          x,
          height * (0.98 - flicker * 0.02),
          0,
          x,
          height * 0.98,
          height * (strong ? 0.34 : 0.22) * flicker
        );
        flame.addColorStop(0, strong ? "rgba(255, 106, 0, 0.2)" : "rgba(255, 106, 0, 0.08)");
        flame.addColorStop(0.45, strong ? "rgba(193, 18, 31, 0.09)" : "rgba(193, 18, 31, 0.035)");
        flame.addColorStop(1, "rgba(255, 106, 0, 0)");
        context.fillStyle = flame;
        context.fillRect(0, 0, width, height);
      }
    };

    const draw = () => {
      const reducedMotion = mediaQuery.matches;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      drawFireWash();
      frame += 1;

      for (const ember of embers) {
        drawEmber(ember, reducedMotion);

        if (!reducedMotion) {
          ember.life += 1;
          ember.x += ember.vx + Math.sin(ember.life * 0.026 + ember.heat * 8) * 0.13;
          ember.y += ember.vy;
          ember.alpha = 0;

          if (
            ember.life > ember.maxLife ||
            ember.x < -40 ||
            ember.x > width + 40 ||
            ember.y < -24
          ) {
            Object.assign(ember, makeEmber(width, height, intensity));
          }
        } else {
          ember.alpha = intensity === "firefront" ? 0.18 : 0.1;
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
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-[1] h-full w-full mix-blend-screen", className)}
    />
  );
}
