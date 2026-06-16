import Link from "next/link";

import { FlaggedPromo } from "@/components/site/flagged-promo";
import { TrackedLink } from "@/components/site/tracked-link";
import type { AnalyticsEventName } from "@/lib/analytics";

/**
 * External footer links carry a `platform` tag and fire a funnel event (#32):
 * the channel link reports `channel_click`, the rest `community_click`, all
 * tagged `location: "footer"` so outbound clicks are attributable per platform.
 */
const LINKS: {
  label: string;
  href: string;
  ext?: boolean;
  event?: AnalyticsEventName;
  platform?: string;
}[] = [
  { label: "Games", href: "/games" },
  { label: "Factions", href: "/factions" },
  { label: "Build Log", href: "/log" },
  { label: "Pricing", href: "/pricing" },
  { label: "Assets", href: "/assets" },
  { label: "YouTube", href: "/youtube" },
  { label: "Newsletter", href: "/#newsletter" },
  { label: "Docs ↗", href: "https://docs.shipshit.games", ext: true, event: "community_click", platform: "docs" },
  { label: "Legal", href: "/legal" },
  { label: "Play (DEADROT) ↗", href: "https://deadrot.com", ext: true, event: "community_click", platform: "deadrot" },
  { label: "GitHub ↗", href: "https://github.com/shipshitgames", ext: true, event: "community_click", platform: "github" },
  { label: "v0 scaffolder ↗", href: "https://github.com/shipshitdev/v0", ext: true, event: "community_click", platform: "v0" },
  { label: "Skills ↗", href: "https://github.com/shipshitgames/skills", ext: true, event: "community_click", platform: "skills" },
  { label: "shipshitshow ↗", href: "https://youtube.com/@shipshitshow", ext: true, event: "channel_click", platform: "youtube" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-gunmetal/60 bg-void">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Ship <span className="text-blood">Shit</span> Games
        </div>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ash">
          The studio building the <a href="https://deadrot.com" className="text-bone underline decoration-gunmetal underline-offset-2 hover:decoration-blood">DEADROT</a> universe
          live with AI. We ship games in public and sell the monthly Studio Pass.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-widest">
          {LINKS.map((l) =>
            l.ext ? (
              <TrackedLink
                key={l.label}
                href={l.href}
                event={l.event ?? "community_click"}
                eventProps={{ location: "footer", ...(l.platform ? { platform: l.platform } : {}) }}
                className="text-hellfire transition-colors hover:text-blood"
              >
                {l.label}
              </TrackedLink>
            ) : (
              <Link
                key={l.label}
                href={l.href}
                className="text-hellfire transition-colors hover:text-blood"
              >
                {l.label}
              </Link>
            )
          )}
        </div>
        <FlaggedPromo />
        <p className="mt-8 text-[0.65rem] uppercase tracking-widest text-gunmetal">
          © Ship Shit Games · Building in public · MIT where noted
        </p>
      </div>
    </footer>
  );
}
