#!/usr/bin/env bun
import { runGenerate } from "./commands/generate.ts";
import { runMatrixCommand } from "./commands/matrix.ts";
import { runNotImplemented } from "./commands/not-implemented.ts";
import { runPixelizeCommand } from "./commands/pixelize.ts";
import { runTokensCommand } from "./commands/tokens.ts";

type CommandRunner = (argv: string[]) => Promise<void>;

const COMMANDS: Record<string, CommandRunner> = {
  generate: runGenerate,
  matrix: runMatrixCommand,
  tokens: runTokensCommand,
  pixelize: runPixelizeCommand,
  promote: runNotImplemented("promote"),
  codegen: runNotImplemented("codegen"),
  check: runNotImplemented("check"),
  index: runNotImplemented("index"),
};

const argv = process.argv.slice(2);
const maybeVerb = argv[0];

if (maybeVerb && maybeVerb in COMMANDS) {
  const command = COMMANDS[maybeVerb];
  if (!command) {
    console.error(`unknown assetgen command: ${maybeVerb}`);
    process.exit(1);
  }
  await command(argv.slice(1));
} else if (!maybeVerb || maybeVerb.startsWith("--")) {
  await runGenerate(argv);
} else {
  console.error(`unknown assetgen command: ${maybeVerb}`);
  console.error(`usage: assetgen <${Object.keys(COMMANDS).join("|")}> [options]`);
  process.exit(1);
}
