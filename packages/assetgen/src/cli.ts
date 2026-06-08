#!/usr/bin/env bun
type CommandRunner = (argv: string[]) => Promise<void>;
type CommandLoader = () => Promise<CommandRunner>;

const COMMANDS: Record<string, CommandLoader> = {
  generate: async () => (await import("./commands/generate.ts")).runGenerate,
  games: async () => (await import("./commands/games.ts")).runGamesCommand,
  matrix: async () => (await import("./commands/matrix.ts")).runMatrixCommand,
  tokens: async () => (await import("./commands/tokens.ts")).runTokensCommand,
  "check-design": async () => (await import("./commands/check-design.ts")).runCheckDesignCommand,
  pixelize: async () => (await import("./commands/pixelize.ts")).runPixelizeCommand,
  promote: async () => (await import("./commands/not-implemented.ts")).runNotImplemented("promote"),
  codegen: async () => (await import("./commands/not-implemented.ts")).runNotImplemented("codegen"),
  check: async () => (await import("./commands/not-implemented.ts")).runNotImplemented("check"),
  index: async () => (await import("./commands/not-implemented.ts")).runNotImplemented("index"),
};

const argv = process.argv.slice(2);
const maybeVerb = argv[0];

if (maybeVerb && maybeVerb in COMMANDS) {
  const loadCommand = COMMANDS[maybeVerb];
  if (!loadCommand) {
    console.error(`unknown assetgen command: ${maybeVerb}`);
    process.exit(1);
  }
  const command = await loadCommand();
  await command(argv.slice(1));
} else if (!maybeVerb || maybeVerb.startsWith("--")) {
  const { runGenerate } = await import("./commands/generate.ts");
  await runGenerate(argv);
} else {
  console.error(`unknown assetgen command: ${maybeVerb}`);
  console.error(`usage: assetgen <${Object.keys(COMMANDS).join("|")}> [options]`);
  process.exit(1);
}
