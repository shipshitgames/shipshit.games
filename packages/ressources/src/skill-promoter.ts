import type { Stats } from "node:fs";
import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { DerivativeManifest, SourceManifest, TranscriptResource } from "./types";
import { packageRoot, schemasDir } from "./paths";
import { validateValue, type JsonSchema } from "./schema";

export interface PromoteSkillOptions {
  candidateManifestPath: string;
  libraryRoot?: string;
  skillsRoot?: string;
  dryRun?: boolean;
  approve?: boolean;
}

export interface PromoteSkillResult {
  targetPath: string;
  content: string;
  diff: string;
  changed: boolean;
  wrote: boolean;
}

type SkillManifest = DerivativeManifest & {
  kind: "skill";
  sourceRules?: string[];
};

const repositoryRoot = resolve(packageRoot, "..", "..");
const defaultSkillsRoot = resolve(repositoryRoot, ".agents", "skills");
const rawTranscriptHeading = /^#{1,6}\s+raw transcript\b/im;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function statEntry(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isInside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith(sep));
}

function resolveInside(root: string, declaredPath: string, label: string): string {
  if (!declaredPath || declaredPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(declaredPath)) {
    throw new Error(`${label} must be a relative path inside the ressources library`);
  }
  const path = resolve(root, declaredPath);
  if (!isInside(root, path)) throw new Error(`${label} escapes the ressources library: ${declaredPath}`);
  return path;
}

async function assertPhysicalContainment(root: string, path: string, label: string): Promise<void> {
  const [physicalRoot, physicalPath] = await Promise.all([realpath(root), realpath(path)]);
  if (!isInside(physicalRoot, physicalPath)) {
    throw new Error(`${label} resolves outside the ressources library`);
  }
}

async function readJson(path: string, label: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
}

async function readSchema(name: string): Promise<JsonSchema> {
  return (await readJson(resolve(schemasDir, name), `${name} schema`)) as JsonSchema;
}

function assertSchema(value: unknown, schema: JsonSchema, label: string): void {
  const errors = validateValue(value, schema, label);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

async function validateTranscriptReference(
  root: string,
  reference: string,
  transcriptSchema: JsonSchema,
  sourceSchema: JsonSchema,
): Promise<void> {
  if (!reference.startsWith("transcripts/") || !reference.endsWith(".resource.json")) {
    throw new Error(
      `source transcript references must point to transcripts/**/*.resource.json sidecars: ${reference}`,
    );
  }
  const sidecarPath = resolveInside(root, reference, "source transcript reference");
  if (!(await exists(sidecarPath))) throw new Error(`source transcript reference does not exist: ${reference}`);
  await assertPhysicalContainment(root, sidecarPath, "source transcript reference");

  const transcript = await readJson(sidecarPath, `source transcript ${reference}`);
  assertSchema(transcript, transcriptSchema, `source transcript ${reference}`);
  const resource = transcript as TranscriptResource;

  const transcriptPath = resolveInside(root, resource.transcriptPath, `${reference}.transcriptPath`);
  if (!(await exists(transcriptPath))) {
    throw new Error(`${reference}.transcriptPath does not exist: ${resource.transcriptPath}`);
  }
  await assertPhysicalContainment(root, transcriptPath, `${reference}.transcriptPath`);

  const sourcePath = resolveInside(root, `sources/${resource.sourceSlug}/source.json`, `${reference}.sourceSlug`);
  if (!(await exists(sourcePath))) {
    throw new Error(`${reference} references unknown source ${resource.sourceSlug}`);
  }
  await assertPhysicalContainment(root, sourcePath, `${reference}.sourceSlug`);
  const source = await readJson(sourcePath, `source ${resource.sourceSlug}`);
  assertSchema(source, sourceSchema, `source ${resource.sourceSlug}`);
  if ((source as SourceManifest).slug !== resource.sourceSlug) {
    throw new Error(`${reference} source slug does not match ${resource.sourceSlug}`);
  }
}

async function validateRuleReference(
  root: string,
  reference: string,
  derivativeSchema: JsonSchema,
): Promise<void> {
  if (!reference.startsWith("derivatives/rules/") || !reference.endsWith(".resource.json")) {
    throw new Error(
      `source rule references must point to derivatives/rules/*.resource.json sidecars: ${reference}`,
    );
  }
  const sidecarPath = resolveInside(root, reference, "source rule reference");
  if (!(await exists(sidecarPath))) throw new Error(`source rule reference does not exist: ${reference}`);
  await assertPhysicalContainment(root, sidecarPath, "source rule reference");

  const ruleValue = await readJson(sidecarPath, `source rule ${reference}`);
  assertSchema(ruleValue, derivativeSchema, `source rule ${reference}`);
  const rule = ruleValue as DerivativeManifest;
  if (rule.kind !== "rule") throw new Error(`source rule ${reference} has kind ${rule.kind}, expected rule`);

  const outputPath = resolveInside(root, rule.outputPath, `${reference}.outputPath`);
  if (!(await exists(outputPath))) throw new Error(`${reference}.outputPath does not exist: ${rule.outputPath}`);
  await assertPhysicalContainment(root, outputPath, `${reference}.outputPath`);
}

function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading: string | undefined;
  let lines: string[] = [];
  let fence: { character: string; length: number } | undefined;

  const flush = (): void => {
    if (heading) sections.set(heading, lines.join("\n").trim());
  };

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      lines.push(line);
      if (
        new RegExp(
          `^\\s{0,3}${fence.character}{${fence.length},}\\s*$`,
        ).test(line)
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = {
        character: fenceMatch[1][0]!,
        length: fenceMatch[1].length,
      };
      if (heading) lines.push(line);
      continue;
    }

    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      flush();
      heading = match[1].trim().toLowerCase();
      lines = [];
    } else if (heading) {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function firstSection(sections: Map<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = sections.get(name.toLowerCase());
    if (value) return value;
  }
  return undefined;
}

function requiredSection(
  sections: Map<string, string>,
  label: string,
  ...names: string[]
): string {
  const value = firstSection(sections, ...names);
  if (!value) {
    throw new Error(
      `candidate is missing a reviewed ${label} section; complete the derivative before promotion`,
    );
  }
  return value;
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

function renderSkill(
  manifest: SkillManifest,
  candidatePath: string,
  candidate: string,
  libraryRoot: string,
): string {
  const sections = parseSections(candidate);
  const trigger = requiredSection(sections, "Trigger Rules", "trigger rules", "trigger");
  const workflow = requiredSection(sections, "Workflow", "workflow");
  const inputs = requiredSection(sections, "Inputs", "inputs");
  const outputs = requiredSection(sections, "Outputs", "outputs");
  const verification = requiredSection(
    sections,
    "Verification",
    "verification steps",
    "verification",
    "promotion checklist",
  );
  const guidance = firstSection(sections, "implementation notes");
  if (guidance === "- Pending review.") {
    throw new Error("candidate still contains a pending-review placeholder; complete review before promotion");
  }
  const sourceReferences = [...manifest.sourceTranscripts, ...(manifest.sourceRules ?? [])];
  const candidateReference = relative(libraryRoot, candidatePath).split(sep).join("/");
  const tags = [...new Set([...manifest.tags, "ressources", "promoted"])].join(", ");

  return [
    "---",
    `name: ${manifest.slug}`,
    `description: ${yamlString(`${manifest.summary} Use when the ${manifest.title} workflow applies.`)}`,
    "metadata:",
    '  version: "1.0.0"',
    `  tags: ${yamlString(tags)}`,
    "---",
    "",
    `# ${manifest.title}`,
    "",
    manifest.summary,
    "",
    "## Provenance",
    "",
    `- Candidate: \`${candidateReference}\``,
    ...sourceReferences.map((reference) => `- Source: \`${reference}\``),
    "",
    "This skill contains only reviewed derivative guidance. It does not embed or reproduce raw transcript text.",
    "",
    "## Trigger Rules",
    "",
    trigger,
    "",
    "## Workflow",
    "",
    workflow,
    "",
    "## Inputs",
    "",
    inputs,
    "",
    "## Outputs",
    "",
    outputs,
    "",
    ...(guidance ? ["## Implementation Notes", "", guidance, ""] : []),
    "## Verification",
    "",
    verification,
    "",
    "## Review Gate",
    "",
    "- Review `ressources promote-skill --dry-run` output before approving an update.",
    "- Promote only original, repeatable guidance with verified provenance.",
    "- Keep raw transcripts in the ressources library under their declared rights policy; never copy them into this skill.",
    "",
  ].join("\n");
}

function renderDiff(targetPath: string, before: string | undefined, after: string): string {
  if (before === after) return `(no changes) ${targetPath}`;
  const beforeLines = before?.replace(/\n$/, "").split("\n") ?? [];
  const afterLines = after.replace(/\n$/, "").split("\n");
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const contextStart = Math.max(0, prefix - 3);
  const beforeEnd = Math.min(beforeLines.length, beforeLines.length - suffix + 3);
  const afterEnd = Math.min(afterLines.length, afterLines.length - suffix + 3);
  const leadingContext = beforeLines.slice(contextStart, prefix);
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  const trailingContext = beforeLines.slice(beforeLines.length - suffix, beforeEnd);
  const oldCount = beforeEnd - contextStart;
  const newCount = afterEnd - contextStart;
  const oldStart = oldCount === 0 ? contextStart : contextStart + 1;
  const newStart = newCount === 0 ? contextStart : contextStart + 1;

  return [
    `--- ${before === undefined ? "/dev/null" : `a/${targetPath}`}`,
    `+++ b/${targetPath}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...leadingContext.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...trailingContext.map((line) => ` ${line}`),
  ].join("\n");
}

export async function promoteSkill(options: PromoteSkillOptions): Promise<PromoteSkillResult> {
  if (options.dryRun && options.approve) throw new Error("--dry-run and --approve are mutually exclusive");
  if (!options.dryRun && !options.approve) {
    throw new Error("refusing to write without --approve; review --dry-run output first");
  }

  const libraryRoot = resolve(options.libraryRoot ?? packageRoot);
  const skillsRoot = resolve(options.skillsRoot ?? defaultSkillsRoot);
  const candidateInput = resolve(options.candidateManifestPath);
  const candidateManifestPath = isInside(libraryRoot, candidateInput)
    ? candidateInput
    : resolveInside(libraryRoot, options.candidateManifestPath, "candidate manifest");

  if (!(await exists(candidateManifestPath))) {
    throw new Error(`candidate manifest does not exist: ${options.candidateManifestPath}`);
  }
  await assertPhysicalContainment(libraryRoot, candidateManifestPath, "candidate manifest");
  const relativeManifestPath = relative(libraryRoot, candidateManifestPath).split(sep).join("/");
  if (!relativeManifestPath.startsWith("derivatives/skills/") || !relativeManifestPath.endsWith(".resource.json")) {
    throw new Error("candidate manifest must be a derivatives/skills/*.resource.json sidecar");
  }

  const [derivativeSchema, transcriptSchema, sourceSchema] = await Promise.all([
    readSchema("derivative.schema.json"),
    readSchema("transcript-resource.schema.json"),
    readSchema("source.schema.json"),
  ]);
  const manifestValue = await readJson(candidateManifestPath, "candidate manifest");
  assertSchema(manifestValue, derivativeSchema, "candidate");
  const manifest = manifestValue as SkillManifest;
  if (manifest.kind !== "skill") throw new Error(`candidate kind must be skill, got ${manifest.kind}`);
  if (manifest.status !== "candidate") {
    throw new Error(`candidate status must be candidate, got ${manifest.status}`);
  }
  if (basename(candidateManifestPath, ".resource.json") !== manifest.slug) {
    throw new Error(`candidate slug ${manifest.slug} does not match its manifest filename`);
  }

  const sourceReferences = [...manifest.sourceTranscripts, ...(manifest.sourceRules ?? [])];
  if (sourceReferences.length === 0) {
    throw new Error("candidate must reference at least one source transcript or distilled rule");
  }
  await Promise.all([
    ...manifest.sourceTranscripts.map((reference) =>
      validateTranscriptReference(libraryRoot, reference, transcriptSchema, sourceSchema),
    ),
    ...(manifest.sourceRules ?? []).map((reference) =>
      validateRuleReference(libraryRoot, reference, derivativeSchema),
    ),
  ]);

  const candidatePath = resolveInside(libraryRoot, manifest.outputPath, "candidate outputPath");
  if (!relative(libraryRoot, candidatePath).split(sep).join("/").startsWith("derivatives/skills/")) {
    throw new Error("candidate outputPath must be inside derivatives/skills/");
  }
  if (!(await exists(candidatePath))) throw new Error(`candidate outputPath does not exist: ${manifest.outputPath}`);
  await assertPhysicalContainment(libraryRoot, candidatePath, "candidate outputPath");
  const candidate = await readFile(candidatePath, "utf8");
  if (rawTranscriptHeading.test(candidate)) {
    throw new Error("candidate contains a raw transcript section; distill original guidance before promotion");
  }

  const content = renderSkill(manifest, candidatePath, candidate, libraryRoot);
  const targetPath = resolve(skillsRoot, manifest.slug, "SKILL.md");
  if (!isInside(skillsRoot, targetPath)) throw new Error(`skill slug escapes the skills root: ${manifest.slug}`);
  const targetEntry = await statEntry(targetPath);
  if (targetEntry?.isSymbolicLink()) {
    throw new Error(`skill target must not be a symbolic link: ${manifest.slug}/SKILL.md`);
  }
  if ((await exists(skillsRoot)) && (await exists(dirname(targetPath)))) {
    const [physicalSkillsRoot, physicalTargetDir] = await Promise.all([
      realpath(skillsRoot),
      realpath(dirname(targetPath)),
    ]);
    if (!isInside(physicalSkillsRoot, physicalTargetDir)) {
      throw new Error(`skill target resolves outside the skills root: ${manifest.slug}`);
    }
    if (targetEntry) {
      const physicalTarget = await realpath(targetPath);
      if (!isInside(physicalSkillsRoot, physicalTarget)) {
        throw new Error(`skill target resolves outside the skills root: ${manifest.slug}/SKILL.md`);
      }
    }
  }
  const before = (await exists(targetPath)) ? await readFile(targetPath, "utf8") : undefined;
  const changed = before !== content;
  const targetLabel = (
    isInside(repositoryRoot, targetPath)
      ? relative(repositoryRoot, targetPath)
      : relative(skillsRoot, targetPath)
  )
    .split(sep)
    .join("/");
  const diff = renderDiff(targetLabel, before, content);

  if (!options.dryRun && changed) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, "utf8");
  }

  return {
    targetPath,
    content,
    diff,
    changed,
    wrote: !options.dryRun && changed,
  };
}
