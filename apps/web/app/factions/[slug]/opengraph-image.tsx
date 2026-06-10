import { ImageResponse } from "next/og";

import { ACCENT_HEX } from "@/components/games/accent";
import { getFaction } from "@/lib/content";

export const alt = "Ship Shit Games faction dossier";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VOID = "#0a0a0a";
const BONE = "#e9e3d6";
const ASH = "#9b958a";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const faction = slug === "scourge" ? null : getFaction(slug);

  const accent = slug === "scourge" ? ACCENT_HEX.toxic : ACCENT_HEX[faction?.accent ?? "blood"];
  const name = (faction?.name ?? "The Scourge").toUpperCase();
  const tagline =
    faction?.tagline ?? "It doesn't want to kill you. It wants to wear you.";
  const doctrineLine = (faction?.doctrine ?? "the enemy — one mind, every body").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: VOID,
        }}
      >
        <div style={{ display: "flex", width: 28, backgroundColor: accent }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
            padding: "64px 72px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 10,
              color: ASH,
            }}
          >
            SHIPSHIT.GAMES
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 104,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: -2,
                color: BONE,
              }}
            >
              {name}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 28,
                maxWidth: 980,
                fontSize: 34,
                lineHeight: 1.3,
                color: ASH,
              }}
            >
              {tagline}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 6,
              color: accent,
            }}
          >
            {doctrineLine}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
