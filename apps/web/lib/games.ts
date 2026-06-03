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
      "3D tower defense. Hold the line for the Wardens against everything the lane vomits up.",
    status: "IN DEV",
    repo: "https://github.com/shipshitgames/deadlane",
  },
  {
    slug: "pactfall",
    title: "Pactfall",
    blurb:
      "Pyre-vs-Wardens MOBA. Two factions test the Pact in the blood-arena — pick a side and burn.",
    status: "CONCEPT",
    repo: "https://github.com/shipshitgames/pactfall",
  },
  {
    slug: "starblight",
    title: "Starblight",
    blurb:
      "Arcade pilot shooter. Space Invaders x Galaga x Survivors — burn the orbital infection.",
    status: "CONCEPT",
    repo: "https://github.com/shipshitgames/starblight",
  },
];
