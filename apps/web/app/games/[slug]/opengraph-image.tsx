import { ImageResponse } from "next/og";
import { GAMES, STATUS_LABELS } from "@shipshitgames/shared";

import { ACCENT_HEX } from "@/components/games/accent";
import { getGameLore } from "@/lib/content";

export const alt = "Ship Shit Games game brief";
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
  const game = GAMES.find((g) => g.slug === slug);
  const lore = getGameLore(slug);

  const accent = ACCENT_HEX[lore?.accent ?? "blood"];
  const title = (game?.title ?? "Deadrot").toUpperCase();
  const tagline = lore?.tagline ?? game?.blurb ?? "Built live, in public.";
  const statusLine = game
    ? `${STATUS_LABELS[game.status]} · ${lore?.genre ?? game.genre}`.toUpperCase()
    : "DEADROT UNIVERSE";

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
              {title}
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
            {statusLine}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
