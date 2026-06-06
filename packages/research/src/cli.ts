#!/usr/bin/env bun
// research — turn a YouTube tutorial into a reusable game-build ruleset.
//
//   bun src/cli.ts --url <youtube-url> [--out rules.md] [--provider codex|mock]
//                  [--out-transcript transcript.md] [--transcript-file path] [--title "..."]
//
// Streams progress as `[tag] ...` lines; on success prints `[wrote] <path>` so the
// desktop Studio pane (and CI) can pick the output path out of the log.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchTranscript } from "./transcript.ts";
import { distill } from "./distill.ts";

const argv = process.argv.slice(2);
const flag = (name: string, def?: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const url = flag("url");
const transcriptFile = flag("transcript-file");
const out = resolve(flag("out", "rules.generated.md")!);
const outTranscript = flag("out-transcript");
const provider = flag("provider", "codex")!;
let title = flag("title");

if (!url && !transcriptFile) {
  console.error(
    "usage: research --url <youtube-url> [--out rules.md] [--provider codex|mock]\n" +
      "                [--out-transcript transcript.md] [--transcript-file <path>] [--title <title>]",
  );
  process.exit(1);
}

const log = (m: string) => console.log(m);

let transcript: string;
if (transcriptFile) {
  log(`[transcript] reading ${transcriptFile}`);
  transcript = await readFile(resolve(transcriptFile), "utf8");
  title ??= transcriptFile;
} else {
  const r = await fetchTranscript(url!, log);
  transcript = r.transcript;
  title ??= r.title;
}

if (outTranscript) {
  const transcriptOut = resolve(outTranscript);
  await mkdir(dirname(transcriptOut), { recursive: true });
  await writeFile(transcriptOut, transcript, "utf8");
  log(`[transcript-wrote] ${transcriptOut} (${(transcript.length / 1024).toFixed(1)} kb)`);
}

log(`[distill] provider=${provider}`);
const rules = await distill({ transcript, title: title ?? "Untitled", url: url ?? "", provider, log });

await mkdir(dirname(out), { recursive: true });
await writeFile(out, rules, "utf8");
log(`[wrote] ${out} (${(rules.length / 1024).toFixed(1)} kb)`);
process.exit(0);
