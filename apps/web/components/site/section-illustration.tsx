import Image from "next/image";

/**
 * Full-bleed pixel-art backdrop for a marketing section: a covered image dimmed
 * behind dual gradient scrims so foreground copy stays legible. Shared by the
 * home-page sections (moved out of app/page.tsx).
 */
export function SectionIllustration({
  src,
  objectPosition = "center",
  opacity = 0.22,
}: {
  src: string;
  objectPosition?: string;
  opacity?: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        src={src}
        alt=""
        fill
        sizes="100vw"
        className="object-cover contrast-110 saturate-125 [image-rendering:pixelated]"
        style={{ objectPosition, opacity }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,6,5,0.98),rgba(6,6,5,0.82)_46%,rgba(6,6,5,0.96))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,transparent,rgba(6,6,5,0.82)_64%)]" />
    </div>
  );
}
