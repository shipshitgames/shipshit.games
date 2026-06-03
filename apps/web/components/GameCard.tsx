import type { Game, GameStatus } from "@/lib/games";

const statusStyles: Record<GameStatus, string> = {
  PLAYABLE: "border-hellfire/60 text-hellfire shadow-ember",
  "IN DEV": "border-blood/60 text-blood",
  CONCEPT: "border-gunmetal text-ash",
};

export function GameCard({ game }: { game: Game }) {
  return (
    <article className="group flex h-full flex-col justify-between rounded-sm border border-gunmetal bg-coal p-6 transition-colors hover:border-blood">
      <div>
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
            {game.title}
          </h3>
          <span
            className={`shrink-0 rounded-sm border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest ${statusStyles[game.status]}`}
          >
            {game.status}
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ash">{game.blurb}</p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        {game.demo ? (
          <a
            href={game.demo}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm bg-blood px-4 py-2 text-sm font-bold uppercase tracking-wide text-bone transition-shadow hover:shadow-ember"
          >
            Play
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="cursor-not-allowed rounded-sm border border-gunmetal px-4 py-2 text-sm font-bold uppercase tracking-wide text-ash opacity-60"
          >
            Play
          </span>
        )}
        <a
          href={game.repo}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm border border-hellfire/50 px-4 py-2 text-sm font-bold uppercase tracking-wide text-hellfire transition-shadow hover:shadow-ember"
        >
          Source
        </a>
      </div>
    </article>
  );
}
