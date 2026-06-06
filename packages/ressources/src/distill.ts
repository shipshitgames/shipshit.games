// Turn a raw transcript into a reusable game-build RULESET. Default provider is
// the local Codex CLI (your subscription, no API key), same bet as assetgen.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pexec = promisify(execFile);

export interface DistillInput {
  transcript: string;
  title: string;
  url: string;
  provider: string;
  log?: (m: string) => void;
}

const SECTIONS = [
  "Toolchain (and our equivalents)",
  "Art pipeline (per character/enemy)",
  "Animation",
  "Parallax & backgrounds",
  "Gyms (QA harnesses)",
  "Atlas + JSON manifest",
  "Level editor & persistence",
  "Enemies",
  "HUD & polish",
  "Splash screen",
];

function rulesPrompt(title: string, url: string, inPath: string, outPath: string): string {
  return [
    `Read the transcript file at ${inPath}.`,
    `It is the auto-caption transcript of the game-dev tutorial video "${title}" (${url}).`,
    "Distill it into a concise, reusable ruleset for AI-assisted game asset, animation, and level production.",
    "Write GitHub-flavored markdown with a top \"# \" title and these \"## \" sections, in order:",
    `${SECTIONS.map((section, index) => `${index + 1}. ${section}`).join("; ")}.`,
    "Under each section give 3-8 imperative, specific rules as bullets.",
    "Name concrete tools the author uses and, where relevant, note our stack equivalents.",
    "Be terse and practical. No preamble, no marketing, no sponsor mentions.",
    `Write ONLY the markdown to ${outPath}. Do not print it to stdout.`,
  ].join(" ");
}

async function distillViaCodex(input: DistillInput): Promise<string> {
  const { transcript, title, url, log = () => {} } = input;
  const dir = await mkdtemp(join(tmpdir(), "ressources-distill-"));
  const inPath = join(dir, "transcript.txt");
  const outPath = join(dir, "rules.md");
  await writeFile(inPath, transcript, "utf8");
  log(`[distill] codex exec — distilling ${transcript.split(/\s+/).length} words...`);
  await pexec(
    "codex",
    [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "-C",
      dir,
      rulesPrompt(title, url, inPath, outPath),
    ],
    { timeout: 280_000, maxBuffer: 32 * 1024 * 1024 },
  );
  return readFile(outPath, "utf8");
}

function distillMock(input: DistillInput): string {
  const { title, url, transcript } = input;
  const words = transcript.split(/\s+/).length;
  return [
    `# Rules - ${title}`,
    "",
    `> Source: ${url}`,
    `> Mock distillation (no model). Transcript captured: ${words} words.`,
    "> Re-run with `--provider codex` to generate the real ruleset.",
    "",
    ...SECTIONS.map((section) => `## ${section}\n\n- _(pending - run with a real provider)_\n`),
  ].join("\n");
}

export async function distill(input: DistillInput): Promise<string> {
  switch (input.provider) {
    case "codex":
      return distillViaCodex(input);
    case "mock":
      return distillMock(input);
    default:
      throw new Error(`unknown provider: ${input.provider} (use codex | mock)`);
  }
}
