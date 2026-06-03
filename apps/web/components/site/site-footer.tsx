import Link from "next/link";

const LINKS: { label: string; href: string; ext?: boolean }[] = [
  { label: "Universe / Lore", href: "/universe" },
  { label: "GitHub ↗", href: "https://github.com/shipshitgames", ext: true },
  { label: "Lore Vault ↗", href: "https://github.com/shipshitgames/lore", ext: true },
  { label: "Skills ↗", href: "https://github.com/shipshitgames/skills", ext: true },
  { label: "shipshitshow ↗", href: "https://youtube.com/@shipshitshow", ext: true },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-gunmetal/60 bg-void">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Ship <span className="text-blood">Shit</span> Games
        </div>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ash">
          Open-source AI game studio. One blood-soaked universe — DOOM × Blizzard —
          forged live on the shipshitshow.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-widest">
          {LINKS.map((l) =>
            l.ext ? (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-hellfire transition-colors hover:text-blood"
              >
                {l.label}
              </a>
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
        <p className="mt-8 text-[0.65rem] uppercase tracking-widest text-gunmetal">
          © Ship Shit Games · Open-core · MIT where noted
        </p>
      </div>
    </footer>
  );
}
