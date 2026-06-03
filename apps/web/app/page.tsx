import { GameCard } from "@/components/GameCard";
import { games } from "@/lib/games";

const SHOW_URL = "https://youtube.com/@shipshitshow";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <section className="border-b border-gunmetal pb-16">
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-hellfire">
          Open-source AI game studio
        </p>
        <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-[0.95] tracking-tight text-bone sm:text-7xl md:text-8xl">
          Ship <span className="text-blood">Shit</span> Games
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
          One brutal, blood-soaked universe — DOOM x Blizzard — built fast and built
          live. Every map, sprite, and monster forged on stream.
        </p>
        <div className="mt-8">
          <a
            href={SHOW_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-sm bg-blood px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-bone transition-shadow hover:shadow-ember"
          >
            Watch the shipshitshow
          </a>
        </div>
      </section>

      <section className="pt-16">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-bone">
          The Gallery
        </h2>
        <p className="mt-2 text-sm uppercase tracking-widest text-ash">
          Games in the universe
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </section>

      <footer className="mt-20 border-t border-gunmetal pt-8 text-xs uppercase tracking-widest text-ash">
        <div>Ship Shit Games — open-core. Forged on the shipshitshow.</div>
        <div className="mt-3 flex flex-wrap gap-5">
          <a className="text-hellfire transition-colors hover:text-blood" href="https://github.com/shipshitgames/lore" target="_blank" rel="noreferrer">Universe / Lore ↗</a>
          <a className="text-hellfire transition-colors hover:text-blood" href="https://github.com/shipshitgames/skills" target="_blank" rel="noreferrer">Skills ↗</a>
          <a className="text-hellfire transition-colors hover:text-blood" href="https://github.com/shipshitgames" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </footer>
    </main>
  );
}
