import type { Metadata } from "next";

import { Hero } from "@/components/home/sections/hero";
import { ProofStrip } from "@/components/home/sections/proof-strip";
import { GamesRailSection } from "@/components/home/sections/games-rail-section";
import { StudioReality } from "@/components/home/sections/studio-reality";
import { BuildLoop } from "@/components/home/sections/build-loop";
import { Deadrot } from "@/components/home/sections/deadrot";
import { StudioOutput } from "@/components/home/sections/studio-output";
import { Newsletter } from "@/components/home/sections/newsletter";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ship Shit Games",
  description:
    "Ship Shit Games builds the DEADROT universe live with AI — a whole IP, many browser games, one bloody canon, and the studio tools behind it.",
};

export default function Home() {
  return (
    <main>
      <Hero />
      <ProofStrip />
      <GamesRailSection />
      <StudioReality />
      <BuildLoop />
      <Deadrot />
      <StudioOutput />
      <Newsletter />
    </main>
  );
}
