import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Boxes, WandSparkles } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Asset Gallery",
  description:
    "A gallery of Ship Shit Games generated covers, portraits, and production-ready game assets.",
  openGraph: {
    title: "Ship Shit Games Asset Gallery",
    description:
      "Generated game covers, faction portraits, and production assets from the Ship Shit Games pipeline.",
    url: "https://shipshit.games/assets",
  },
};

const GAME_ASSETS = [
  {
    title: "Scourge Survivors",
    path: "/images/games/scourge-survivors.webp",
    note: "horde survival key art",
  },
  {
    title: "Pactfall",
    path: "/images/games/pactfall.webp",
    note: "siege strategy cover",
  },
  {
    title: "Deadlane",
    path: "/images/games/deadlane.webp",
    note: "lane shooter cover",
  },
  {
    title: "Starblight",
    path: "/images/games/starblight.webp",
    note: "orbital breach cover",
  },
  {
    title: "Redline",
    path: "/images/games/redline.webp",
    note: "courier runner cover",
  },
  {
    title: "Rothulk",
    path: "/images/games/rothulk.webp",
    note: "platform combat cover",
  },
] as const;

const PORTRAITS = [
  ["Warden Bastion", "/sprites/portrait-warden-bastion.webp", "Warden"],
  ["Warden Artillerist", "/sprites/portrait-warden-artillerist.webp", "Warden"],
  ["Warden Defense Pilot", "/sprites/portrait-warden-defense-pilot.webp", "Warden"],
  ["Field Engineer", "/sprites/portrait-field-engineer.webp", "Warden"],
  ["Lane Gunner", "/sprites/portrait-lane-gunner.webp", "Warden"],
  ["Wallwright", "/sprites/portrait-wallwright.webp", "Warden"],
  ["Pyre Duelist", "/sprites/portrait-pyre-duelist.webp", "Pyre"],
  ["Pyre Cauterizer", "/sprites/portrait-pyre-cauterizer.webp", "Pyre"],
  ["Pyre Saboteur", "/sprites/portrait-pyre-saboteur.webp", "Pyre"],
  ["Pyre Interceptor", "/sprites/portrait-pyre-interceptor-pilot.webp", "Pyre"],
  ["Graft Breacher", "/sprites/portrait-graft-breacher.webp", "Scourge"],
  ["Rot Engine", "/sprites/portrait-rot-engine.webp", "Scourge"],
  ["Scourge Fighter", "/sprites/portrait-scourge-fighter.webp", "Scourge"],
  ["Host Families", "/sprites/portrait-scourge-host-families.webp", "Scourge"],
  ["Orbital Carrier", "/sprites/portrait-orbital-breach-carrier.webp", "Scourge"],
  ["Trucebreaker", "/sprites/portrait-trucebreaker.webp", "Neutral"],
] as const;

const PROCESS = [
  {
    icon: WandSparkles,
    title: "Prompted in canon",
    text: "Every asset starts from game role, faction rules, palette constraints, and a concrete shipping use.",
  },
  {
    icon: Boxes,
    title: "Batched into sets",
    text: "The pipeline can expand one roster into covers, portraits, sprites, pickups, weapons, and UI-ready variants.",
  },
  {
    icon: BadgeCheck,
    title: "Prepared for games",
    text: "Outputs are trimmed, optimized, named, and dropped where the runtime can actually use them.",
  },
] as const;

export default function AssetsPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-20 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(360px,1fr)] lg:items-center">
            <div>
              <Eyebrow>Assetgen showcase</Eyebrow>
              <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
                Game art, generated for shipping.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
                Covers, portraits, sprites, and production assets from the same
                pipeline we use to build Deadrot games in public. The point is
                not pretty one-offs. The point is coherent sets a game can use.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <a href="/pricing">
                    Get Skills Pro
                    <ArrowRight aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
                >
                  <a href="https://docs.shipshit.games/tools/assetgen" target="_blank" rel="noreferrer">
                    Read assetgen docs
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GAME_ASSETS.slice(0, 6).map((asset) => (
                <div
                  key={asset.path}
                  className="group relative aspect-[4/5] overflow-hidden rounded-md border border-gunmetal bg-coal"
                >
                  <Image
                    src={asset.path}
                    alt={`${asset.title} generated cover art`}
                    fill
                    sizes="(min-width: 1024px) 180px, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                    priority={asset.path === "/images/games/scourge-survivors.webp"}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/75 to-transparent p-3">
                    <p className="font-display text-sm font-bold uppercase leading-tight text-bone">
                      {asset.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gunmetal/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>What the pipeline makes</Eyebrow>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PROCESS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-md border border-gunmetal bg-coal p-6">
                  <Icon className="size-5 text-hellfire" aria-hidden="true" />
                  <h2 className="mt-4 font-display text-xl font-bold uppercase tracking-tight text-bone">
                    {item.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ash">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Faction portraits</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
                Cohesive character sets
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-ash">
              Warden engineering, Pyre violence, and Scourge host-takeover forms
              stay visually distinct while still belonging to the same universe.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {PORTRAITS.map(([title, path, faction]) => (
              <article
                key={path}
                className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition duration-300 hover:border-hellfire"
              >
                <div className="relative aspect-square bg-void">
                  <Image
                    src={path}
                    alt={`${title} ${faction} generated portrait`}
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="mask-fade-b object-contain object-bottom p-2 transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="border-t border-gunmetal p-4">
                  <p className="font-display text-base font-bold uppercase leading-tight text-bone">
                    {title}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-hellfire">
                    {faction}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
