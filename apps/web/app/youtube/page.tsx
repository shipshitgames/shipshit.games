import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, MonitorPlay, Radio, Terminal } from "lucide-react";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { TrackedLink } from "@/components/site/tracked-link";
import { Button } from "@/components/ui/button";
import { SITE_META } from "@/lib/content";
import { fetchLatestVideos } from "@/lib/youtube";

export const revalidate = 3600;

const CHANNEL_URL = "https://youtube.com/@ShipShitShow";

const FEATURED_ICONS = [Terminal, Radio] as const;
const FEATURED_LABELS = ["Latest build video", "Latest livestream"] as const;
const PUBLISHED_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

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

/** RSS dates are ISO; curated featured dates are already human-readable. */
function formatPublished(published: string): string {
  if (!published.includes("T")) return published;
  const date = new Date(published);
  if (Number.isNaN(date.getTime())) return published;
  return PUBLISHED_DATE_FORMAT.format(date);
}

export default async function YoutubePage() {
  const { videos: latest } = await fetchLatestVideos(6);

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
                  <TrackedLink
                    href={CHANNEL_URL}
                    event="channel_click"
                    eventProps={{ location: "youtube_page", action: "subscribe" }}
                  >
                    <MonitorPlay aria-hidden="true" />
                    Subscribe on YouTube
                  </TrackedLink>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {SITE_META.youtubeFeatured.map((video, index) => {
              const Icon = FEATURED_ICONS[index % FEATURED_ICONS.length];
              const label = FEATURED_LABELS[index % FEATURED_LABELS.length];
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
                      sandbox="allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-hellfire">
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{label}</span>
                    <span className="text-gunmetal">/</span>
                    <span className="text-ash">{formatPublished(video.published)}</span>
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-bone">
                    {video.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ash">
                    {video.summary}
                  </p>
                  <TrackedLink
                    href={watchUrl}
                    event="video_click"
                    eventProps={{ videoId: video.videoId, location: "youtube_featured" }}
                    className="mt-5 inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
                  >
                    Watch on YouTube
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </TrackedLink>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Fresh from the channel</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-bone sm:text-4xl">
                Latest uploads
              </h2>
            </div>
            <TrackedLink
              href={CHANNEL_URL}
              event="channel_click"
              eventProps={{ location: "youtube_page", action: "all_videos" }}
              className="font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
            >
              All videos →
            </TrackedLink>
          </div>

          <div
            data-testid="latest-uploads"
            className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {latest.map((video) => (
              <TrackedLink
                key={video.videoId}
                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                event="video_click"
                eventProps={{ videoId: video.videoId, location: "youtube_latest" }}
                className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition-colors duration-300 hover:border-hellfire"
              >
                <div className="relative aspect-video overflow-hidden bg-void">
                  <Image
                    src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt={`${video.title} thumbnail`}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <p className="font-mono text-xs text-ash/70">
                    {formatPublished(video.published)}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold uppercase leading-tight tracking-tight text-bone group-hover:text-hellfire">
                    {video.title}
                  </h3>
                </div>
              </TrackedLink>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
