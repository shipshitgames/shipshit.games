import type { Metadata } from "next";
import { ArrowRight, MonitorPlay, Radio, Terminal } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";

const CHANNEL_URL = "https://youtube.com/@ShipShitShow";

const FEATURED = [
  {
    label: "Latest build video",
    title: "Opus 4.8: We Built a Browser FPS in 45 Minutes With One Prompt",
    videoId: "49IkgeGr1kE",
    published: "June 4, 2026",
    summary:
      "A one-prompt browser FPS build with enemy waves, a boss fight, weapons, pickups, collision fixes, and a final playthrough.",
    cta: "Watch the FPS build",
    icon: Terminal,
  },
  {
    label: "Latest Opus livestream",
    title: "[LIVE] Claude Opus 4.8 Masterclass: Everything You Need to Know",
    videoId: "p-WXHu2gU2s",
    published: "June 3, 2026",
    summary:
      "The model-release breakdown: benchmarks, reliability gains, dynamic workflows, token cost, and what changes for agentic builds.",
    cta: "Watch the livestream",
    icon: Radio,
  },
] as const;

export const metadata: Metadata = {
  title: "Ship Shit Show",
  description:
    "Watch Ship Shit Show videos and livestreams about using AI agents to build games.",
  openGraph: {
    title: "Ship Shit Show",
    description:
      "Latest Opus 4.8 game-building videos and livestreams from Ship Shit Games.",
    url: "https://shipshit.games/youtube",
    images: [
      {
        url: "/images/og/ship-shit-show.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Show",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ship Shit Show",
    description:
      "Latest game-building videos and livestreams from Ship Shit Games.",
    images: ["/images/og/ship-shit-show.jpg"],
  },
};

export default function YoutubePage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-20 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <Eyebrow>Ship Shit Show</Eyebrow>
              <h1 className="text-glow mt-5 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
                The game builds are on YouTube.
              </h1>
            </div>
            <div>
              <p className="text-lg leading-relaxed text-ash">
                Watch us test frontier coding models against real game work:
                browser FPS builds, agent workflows, tool routing, and the messy
                parts of shipping in public.
              </p>
              <div className="mt-7">
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <a href={CHANNEL_URL} target="_blank" rel="noreferrer">
                    <MonitorPlay aria-hidden="true" />
                    Subscribe on YouTube
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {FEATURED.map((video) => {
              const Icon = video.icon;
              const watchUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
              return (
                <article
                  key={video.videoId}
                  className="rounded-md border border-gunmetal bg-coal/90 p-5"
                >
                  <div className="aspect-video overflow-hidden rounded-md border border-gunmetal bg-void">
                    <iframe
                      className="h-full w-full"
                      src={`https://www.youtube.com/embed/${video.videoId}`}
                      title={video.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-hellfire">
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{video.label}</span>
                    <span className="text-gunmetal">/</span>
                    <span className="text-ash">{video.published}</span>
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-bone">
                    {video.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ash">
                    {video.summary}
                  </p>
                  <a
                    href={watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
                  >
                    {video.cta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
