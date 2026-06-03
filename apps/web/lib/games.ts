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
      "First-person horde-survivors. Vampire Survivors x DOOM — outrun the Scourge, stack the carnage.",
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
    slug: "bloodlane",
    title: "Bloodlane",
    blurb:
      "Pyre-vs-Wardens MOBA. Two factions, one lane of blood. Pick a side and burn.",
    status: "CONCEPT",
    repo: "https://github.com/shipshitgames/bloodlane",
  },
];
