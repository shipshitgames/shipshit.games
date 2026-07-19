import { relative, resolve } from "node:path";

import { loadDerivatives, loadSources, loadTranscripts } from "./library";
import {
  derivativesDir as defaultDerivativesDir,
  packageRoot,
  sourcesDir as defaultSourcesDir,
  transcriptsDir as defaultTranscriptsDir,
} from "./paths";
import type { DerivativeManifest, DerivativeStatus } from "./types";

export interface RulesReportOptions {
  sourcesDir?: string;
  transcriptsDir?: string;
  derivativesDir?: string;
  contentRoot?: string;
}

interface RuleRecord {
  rule: DerivativeManifest;
  sourceSlugs: string[];
}

const RULE_STATUSES: DerivativeStatus[] = ["active", "candidate", "rejected"];

function relativePath(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.map(markdownCell).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  return [header, divider, ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`)].join(
    "\n",
  );
}

function statusSummary(rules: DerivativeManifest[]): string {
  return RULE_STATUSES.map((status) => ({
    status,
    count: rules.filter((rule) => rule.status === status).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${status}: ${count}`)
    .join(", ");
}

/**
 * Build a deterministic Markdown report entirely from JSON manifests.
 *
 * Transcript sidecars are read only to resolve rule provenance back to source
 * slugs. Raw transcript files are never opened.
 */
export async function generateRulesReport(options: RulesReportOptions = {}): Promise<string> {
  const sourcesDir = options.sourcesDir ?? defaultSourcesDir;
  const transcriptsDir = options.transcriptsDir ?? defaultTranscriptsDir;
  const derivativesDir = options.derivativesDir ?? defaultDerivativesDir;
  const contentRoot = options.contentRoot ?? packageRoot;

  const [sources, transcripts, derivatives] = await Promise.all([
    loadSources(sourcesDir),
    loadTranscripts(transcriptsDir),
    loadDerivatives(derivativesDir),
  ]);
  const rules = derivatives
    .filter((derivative) => derivative.kind === "rule")
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const sourceBySlug = new Map(sources.map((source) => [source.slug, source]));
  const ruleBySlug = new Map(rules.map((rule) => [rule.slug, rule]));
  const sourceSlugByTranscriptReference = new Map<string, string>();
  for (const transcript of transcripts) {
    sourceSlugByTranscriptReference.set(transcript.transcriptPath, transcript.sourceSlug);
    sourceSlugByTranscriptReference.set(
      relativePath(
        contentRoot,
        resolve(transcriptsDir, transcript.sourceSlug, `${transcript.slug}.resource.json`),
      ),
      transcript.sourceSlug,
    );
  }

  const ruleRecords: RuleRecord[] = rules.map((rule) => ({
    rule,
    sourceSlugs: [
      ...new Set(
        rule.sourceTranscripts
          .map((reference) => sourceSlugByTranscriptReference.get(reference))
          .filter((sourceSlug): sourceSlug is string => Boolean(sourceSlug)),
      ),
    ].sort(),
  }));

  const rulesBySource = new Map<string, DerivativeManifest[]>();
  for (const record of ruleRecords) {
    for (const sourceSlug of record.sourceSlugs) {
      const sourceRules = rulesBySource.get(sourceSlug) ?? [];
      sourceRules.push(record.rule);
      rulesBySource.set(sourceSlug, sourceRules);
    }
  }

  const sourceRows = [...sources]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((source) => {
      const sourceRules = rulesBySource.get(source.slug) ?? [];
      const transcriptCount = transcripts.filter(
        (transcript) => transcript.sourceSlug === source.slug,
      ).length;
      return [
        source.slug,
        source.topics.join(", ") || "—",
        String(transcriptCount),
        String(sourceRules.length),
        sourceRules.map((rule) => rule.title).join("; ") || "—",
        statusSummary(sourceRules) || "—",
      ];
    });

  const topicRules = new Map<string, Set<string>>();
  const topicSources = new Map<string, Set<string>>();
  for (const record of ruleRecords) {
    const topics = new Set(record.rule.tags);
    for (const sourceSlug of record.sourceSlugs) {
      for (const topic of sourceBySlug.get(sourceSlug)?.topics ?? []) topics.add(topic);
    }
    for (const topic of topics) {
      const rulesForTopic = topicRules.get(topic) ?? new Set<string>();
      rulesForTopic.add(record.rule.slug);
      topicRules.set(topic, rulesForTopic);

      const sourcesForTopic = topicSources.get(topic) ?? new Set<string>();
      for (const sourceSlug of record.sourceSlugs) sourcesForTopic.add(sourceSlug);
      topicSources.set(topic, sourcesForTopic);
    }
  }
  const topicRows = [...topicRules.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, topicRuleSlugs]) => [
      topic,
      String(topicRuleSlugs.size),
      [...topicRuleSlugs]
        .map((slug) => ruleBySlug.get(slug)?.title ?? slug)
        .join("; "),
      [...(topicSources.get(topic) ?? [])].sort().join(", ") || "—",
    ]);

  const statusRows = RULE_STATUSES.map((status) => {
    const statusRules = rules.filter((rule) => rule.status === status);
    return [
      status,
      String(statusRules.length),
      statusRules.map((rule) => rule.title).join("; ") || "—",
    ];
  });

  const coveredSources = [...rulesBySource.keys()].filter((slug) => sourceBySlug.has(slug)).length;
  const unmappedRules = ruleRecords.filter((record) => record.sourceSlugs.length === 0).length;

  return [
    "# Rules Report",
    "",
    "Generated from source, transcript-sidecar, and derivative manifests only. Raw transcript text is not read.",
    "",
    `- Sources: ${sources.length}`,
    `- Rules: ${rules.length}`,
    `- Source coverage: ${coveredSources}/${sources.length}`,
    `- Rules with unresolved source provenance: ${unmappedRules}`,
    "",
    "## By source",
    "",
    markdownTable(
      ["Source", "Topics", "Transcripts", "Rules", "Rule titles", "Rule statuses"],
      sourceRows.length > 0 ? sourceRows : [["—", "—", "0", "0", "—", "—"]],
    ),
    "",
    "## By topic",
    "",
    markdownTable(
      ["Topic", "Rules", "Rule titles", "Sources"],
      topicRows.length > 0 ? topicRows : [["—", "0", "—", "—"]],
    ),
    "",
    "## By status",
    "",
    markdownTable(["Status", "Rules", "Titles"], statusRows),
    "",
  ].join("\n");
}
