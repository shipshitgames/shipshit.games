import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";

const PLAY = "https://deadrot.com";
const DEADROT_KEY_ART = "/images/games/scourge-survivors.webp";

export function Deadrot() {
  return (
    <PageSection
      accent="blood"
      id="deadrot"
      className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      backdrop
    >
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <Eyebrow>DEADROT</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase leading-tight tracking-tight text-bone sm:text-5xl">
            War IP. Live build.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            DEADROT is the browser-game IP we are building in public: war fronts,
            invasion pressure, hard factions, and the Scourge as parasitic
            host-takeover organisms, not generic monsters.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
              <a href={PLAY}>
                <Play aria-hidden="true" />
                Play Deadrot
              </a>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
            >
              <Link href="/assets">See the war assets</Link>
            </Button>
          </div>
        </div>

        <div className="relative aspect-[1600/759] w-full overflow-hidden border border-gunmetal/70 bg-coal shadow-[0_28px_70px_rgba(0,0,0,0.72)]">
          <Image
            src={DEADROT_KEY_ART}
            alt="Landscape pixel art Deadrot key art"
            fill
            sizes="(min-width: 1024px) 700px, 100vw"
            className="object-cover [image-rendering:pixelated]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,5,0.12),transparent_42%,rgba(6,6,5,0.28))]" />
        </div>
      </div>
    </PageSection>
  );
}
