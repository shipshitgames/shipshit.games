export type GameStatus = "PLAYABLE" | "IN DEV" | "CONCEPT";

export interface Game {
  slug: string;
  title: string;
  blurb: string;
  status: GameStatus;
  repo: string;
  demo?: string;
}

export const games: Game[] = [
  {
    slug: "scourge-survivors",
    title: "Scourge Survivors",
    blurb:
      "First-person horde-survivors. Vampire Survivors x DOOM — survive the swarm, stack the carnage.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/scourge-survivors",
    demo: "https://scourge-survivors.vercel.app",
  },
  {
    slug: "deadlane",
    title: "Deadlane",
    blurb:
      "3D tower defense. Hold the lane for the Wardens — place towers, grind the Scourge wave by wave.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/deadlane",
    demo: "https://deadlane-one.vercel.app",
  },
  {
    slug: "pactfall",
    title: "Pactfall",
    blurb:
      "Pyre-vs-Wardens MOBA. Push the lane, fight over the neutral Scourge — test the Pact.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/pactfall",
    demo: "https://pactfall.vercel.app",
  },
  {
    slug: "starblight",
    title: "Starblight",
    blurb:
      "Arcade pilot shooter. Space Invaders x Galaga x Survivors — burn the orbital infection.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/starblight",
    demo: "https://starblight.vercel.app",
  },
  {
    slug: "redline",
    title: "Redline",
    blurb:
      "High-speed courier runner. Sonic-like — outrun the Scourge down the rot-lanes to deliver the message.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/redline",
    demo: "https://redline-eight-theta.vercel.app",
  },
  {
    slug: "rothulk",
    title: "Rothulk",
    blurb:
      "Infiltration platformer. Mario-like — platform through a living Scourge bio-ship and ignite its core.",
    status: "PLAYABLE",
    repo: "https://github.com/shipshitgames/rothulk",
    demo: "https://rothulk.vercel.app",
  },
];
