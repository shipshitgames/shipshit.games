import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { TrackedLink } from "@/components/site/tracked-link";
import { accentStyle } from "@/components/games/accent";
import type { AccentToken, LatestVideo } from "@/lib/content/types";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Compact cards for the latest channel uploads. Thumbnails come from
 * i.ytimg.com via plain <img> — remote hosts are not configured for next/image.
 */
export function WatchTheBuild({
  videos,
  accent,
}: {
  videos: LatestVideo[];
  accent: AccentToken;
}) {
  if (videos.length === 0) return null;

  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Build log</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
              Watch the build.
            </h2>
          </div>
          <Link
            href="/youtube"
            className="font-display text-xs font-bold uppercase tracking-widest text-[var(--accent)] transition-colors hover:text-bone"
          >
            All episodes →
          </Link>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {videos.map((video) => (
            <TrackedLink
              key={video.videoId}
              href={`https://www.youtube.com/watch?v=${video.videoId}`}
              event="video_click"
              eventProps={{ videoId: video.videoId, location: "game_watch_build" }}
              className="group overflow-hidden rounded-md border border-gunmetal bg-coal transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_0_36px_-14px_var(--accent)]"
            >
              <div className="relative aspect-video overflow-hidden border-b border-gunmetal/60 bg-void">
                <Image
                  src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                  alt={`${video.title} video thumbnail`}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
                <Play
                  aria-hidden="true"
                  className="absolute bottom-3 right-3 size-6 text-bone opacity-80 transition-colors group-hover:text-[var(--accent)]"
                />
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 font-display text-base font-bold uppercase leading-tight tracking-tight text-bone">
                  {video.title}
                </h3>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-ash">
                  {dateFormat.format(new Date(video.published))}
                </p>
              </div>
            </TrackedLink>
          ))}
        </div>
      </div>
    </section>
  );
}
