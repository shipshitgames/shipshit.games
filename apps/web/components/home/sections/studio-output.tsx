import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { SectionIllustration } from "@/components/site/section-illustration";
import { LinkCard } from "@/components/home/link-card";
import { formatUsd, STUDIO_PASS } from "@shipshitgames/shared";

const PRODUCTS = [
  {
    name: "DEADROT",
    desc: "The browser-game universe we are building live: brutal canon, playable builds, source links, and finished-product gates.",
    href: "/games",
    cta: "See the games",
  },
  {
    name: "Skills Pro",
    desc: `The paid operating manual: production prompts, agent workflows, review loops, and updates from the live build. Early buyers get in at ${formatUsd(STUDIO_PASS.founderPriceUsd)}.`,
    href: "/pricing",
    cta: "Buy the pack",
  },
  {
    name: "Asset pipeline",
    desc: "The generated game-art workflow, catalog rules, and assetgen tooling we dogfood on DEADROT.",
    href: "/assets",
    cta: "See the assets",
  },
  {
    name: "Build log",
    desc: "The public record of what worked, what broke, and how the system changed after real shipping pressure.",
    href: "/log",
    cta: "Read the build log",
  },
] as const;

const TOOL_ACCESS = [
  {
    name: "@shipshitdev/v0",
    desc: "The scaffolder we ship every product with — Bun + Turbo monorepo, Next 16, Tailwind, shadcn, agent files. One command, a working repo.",
    href: "https://github.com/shipshitdev/v0",
    cta: "npx @shipshitdev/v0",
  },
  {
    name: "Agent skills",
    desc: "The skill library that drives the studio — scaffolding, deploys, reviews, lore craft. The same ones we use daily.",
    href: "https://github.com/shipshitgames/skills",
    cta: "Browse the skills",
  },
  {
    name: "Game boilerplates",
    desc: "Vite + React + Three.js starters and the shared engine the games are built on. Clone, reskin, ship.",
    href: "https://github.com/shipshitgames",
    cta: "See the repos",
  },
] as const;

// Hoisted so the prop is a stable element reference rather than fresh JSX each
// render (react-doctor/jsx-no-jsx-as-prop).
const ILLUSTRATION = (
  <SectionIllustration src="/images/games/starblight.webp" objectPosition="center 45%" opacity={0.2} />
);

export function StudioOutput() {
  return (
    <PageSection
      accent="rust"
      id="output"
      className="relative scroll-mt-16 overflow-hidden border-t border-gunmetal/40 px-6 py-24"
      illustration={ILLUSTRATION}
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <Eyebrow>Studio output</Eyebrow>
        <h2 className="mt-3 max-w-4xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
          Games. Tools. Receipts.
        </h2>
        <p className="mt-5 max-w-2xl leading-relaxed text-ash">
          This is not a content funnel pretending to be a studio. Each product
          is tied to what we are actually building, using, and publishing.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {PRODUCTS.map((product) => (
            <LinkCard
              key={product.name}
              href={product.href}
              title={product.name}
              desc={product.desc}
              cta={product.cta}
              size="lg"
            />
          ))}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {TOOL_ACCESS.map((tool) => (
            <LinkCard
              key={tool.name}
              href={tool.href}
              title={tool.name}
              desc={tool.desc}
              cta={tool.cta}
              size="md"
            />
          ))}
        </div>
      </div>
    </PageSection>
  );
}
