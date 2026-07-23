import fs from "node:fs";
import path from "node:path";

import type {
  LoreNote,
  LoreNoteSummary,
  LoreVaultState,
  LoreVaultSummary,
} from "../shared/ipc";

const VAULT_ROOT_REL = path.join("apps", "lore", "content");
const NOTE_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".obsidian",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test-results",
]);
const MAX_NOTES = 2_500;
const MAX_NOTE_BYTES = 650_000;

export interface LoreRepoRecord {
  id: string;
  name: string;
  repoPath: string;
  source?: "registered" | "discovered";
}

interface LoreVaultOptions {
  repos: LoreRepoRecord[] | (() => LoreRepoRecord[]);
}

interface ParsedNote {
  note: LoreNoteSummary;
  content: string;
  frontmatter: Record<string, string>;
  headings: string[];
}

interface VaultIndex {
  notes: ParsedNote[];
  byPath: Map<string, ParsedNote>;
}

function repoRecords(options: LoreVaultOptions): LoreRepoRecord[] {
  const raw = typeof options.repos === "function" ? options.repos() : options.repos;
  const seen = new Set<string>();
  const records: LoreRepoRecord[] = [];
  for (const entry of raw || []) {
    if (!entry || typeof entry.repoPath !== "string" || !entry.repoPath.trim()) continue;
    const repoPath = path.resolve(entry.repoPath);
    if (seen.has(repoPath)) continue;
    seen.add(repoPath);
    records.push({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : `repo-${records.length + 1}`,
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : path.basename(repoPath),
      repoPath,
      source: entry.source === "discovered" ? "discovered" : "registered",
    });
  }
  return records;
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function relativePosix(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function safeResolve(root: string, relPath: string): string | null {
  const clean = String(relPath || "").replace(/\\/g, "/");
  if (!clean || clean.includes("\0")) return null;
  const absolute = path.resolve(root, clean);
  const resolvedRoot = path.resolve(root);
  return absolute === resolvedRoot || absolute.startsWith(`${resolvedRoot}${path.sep}`)
    ? absolute
    : null;
}

function walkNotes(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < MAX_NOTES) {
    const dir = stack.pop()!;
    for (const entry of safeReadDir(dir).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && NOTE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
        if (files.length >= MAX_NOTES) break;
      }
    }
  }
  return files.sort((a, b) => relativePosix(root, a).localeCompare(relativePosix(root, b)));
}

function splitFrontmatter(text: string): { body: string; frontmatter: Record<string, string> } {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { body: normalized, frontmatter: {} };
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return { body: normalized, frontmatter: {} };
  const frontmatter: Record<string, string> = {};
  for (const line of normalized.slice(4, end).trim().split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return { body: normalized.slice(end + 4).replace(/^\n+/, ""), frontmatter };
}

function titleFor(body: string, file: string, frontmatter: Record<string, string>): string {
  if (frontmatter.title) return frontmatter.title.slice(0, 160);
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading
    ? heading.replace(/\s+#*$/, "").slice(0, 160)
    : path.basename(file).replace(/\.[^.]+$/, "");
}

function excerptFor(body: string, maxChars = 520): string {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|([^\]]+))?]]/g, "$2$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

function extractTags(body: string): string[] {
  const tags = new Set<string>();
  for (const match of body.matchAll(/(^|\s)#([A-Za-z0-9][A-Za-z0-9/_-]*)/g)) {
    tags.add(match[2]);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function extractWikiLinks(body: string): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]\n]+)]]/g)) {
    const target = match[1].split("|")[0].split("#")[0].trim();
    if (target) links.add(target);
  }
  return [...links].sort((a, b) => a.localeCompare(b));
}

function extractHeadings(body: string): string[] {
  const headings: string[] = [];
  for (const match of body.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const heading = match[1].replace(/\s+#*$/, "").trim();
    if (heading) headings.push(heading);
    if (headings.length >= 80) break;
  }
  return headings;
}

function noteKeys(note: LoreNoteSummary): string[] {
  const withoutExtension = note.path.replace(/\.[^.]+$/, "");
  const keys: string[] = [];
  for (const raw of [withoutExtension, path.posix.basename(withoutExtension), note.title]) {
    const key = raw.trim().toLowerCase();
    if (key) keys.push(key);
  }
  return keys;
}

function normalizeWikiTarget(target: string): string {
  return target.replace(/\\/g, "/").replace(/\.[^.]+$/, "").trim().toLowerCase();
}

function readParsedNote(root: string, file: string): ParsedNote | null {
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_NOTE_BYTES) return null;
    const content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const { body, frontmatter } = splitFrontmatter(content);
    const relativePath = relativePosix(root, file);
    const folder = path.posix.dirname(relativePath);
    return {
      note: {
        path: relativePath,
        title: titleFor(body, file, frontmatter),
        folder: folder === "." ? "root" : folder,
        bytes: Buffer.byteLength(content),
        updatedAt: Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null,
        excerpt: excerptFor(body),
        tags: extractTags(body),
        wikiLinks: extractWikiLinks(body),
        backlinks: [],
      },
      content,
      frontmatter,
      headings: extractHeadings(body),
    };
  } catch {
    return null;
  }
}

function withBacklinks(notes: ParsedNote[]): ParsedNote[] {
  const byKey = new Map<string, string>();
  for (const parsed of notes) {
    for (const key of noteKeys(parsed.note)) byKey.set(key, parsed.note.path);
  }
  const backlinks = new Map<string, Set<string>>();
  for (const parsed of notes) {
    for (const link of parsed.note.wikiLinks) {
      const target = byKey.get(normalizeWikiTarget(link));
      if (!target || target === parsed.note.path) continue;
      const sources = backlinks.get(target) || new Set<string>();
      sources.add(parsed.note.path);
      backlinks.set(target, sources);
    }
  }
  return notes.map((parsed) => ({
    ...parsed,
    note: {
      ...parsed.note,
      backlinks: [...(backlinks.get(parsed.note.path) || [])].sort((a, b) => a.localeCompare(b)),
    },
  }));
}

function readVault(root: string): ParsedNote[] {
  return withBacklinks(
    walkNotes(root)
      .map((file) => readParsedNote(root, file))
      .filter((note): note is ParsedNote => Boolean(note)),
  );
}

function summarizeVault(repo: LoreRepoRecord, cachedCount?: number): LoreVaultSummary {
  const vaultRoot = path.join(repo.repoPath, VAULT_ROOT_REL);
  const exists = fs.existsSync(vaultRoot);
  return {
    id: repo.id,
    name: repo.name,
    repoPath: repo.repoPath,
    vaultRoot,
    exists,
    noteCount: exists ? cachedCount ?? walkNotes(vaultRoot).length : 0,
    source: repo.source === "discovered" ? "discovered" : "registered",
    error: exists ? null : "Obsidian vault not found at apps/lore/content",
  };
}

export function createLoreVaultStore(options: LoreVaultOptions) {
  const cache = new Map<string, VaultIndex>();

  function vaults(): LoreVaultSummary[] {
    return repoRecords(options).map((repo) => {
      const root = path.join(repo.repoPath, VAULT_ROOT_REL);
      return summarizeVault(repo, cache.get(root)?.notes.length);
    });
  }

  function index(root: string, refresh = false): VaultIndex {
    if (!refresh) {
      const cached = cache.get(root);
      if (cached) return cached;
    }
    const notes = readVault(root);
    const indexed = {
      notes,
      byPath: new Map(notes.map((parsed) => [parsed.note.path, parsed])),
    };
    cache.set(root, indexed);
    return indexed;
  }

  function activeVault(repoId?: string): LoreVaultSummary | null {
    const all = vaults();
    return all.find((vault) => vault.id === repoId)
      || all.find((vault) => vault.exists)
      || all[0]
      || null;
  }

  function list(repoId?: string, refresh = false): LoreVaultState {
    const all = vaults();
    const active = all.find((vault) => vault.id === repoId)
      || all.find((vault) => vault.exists)
      || all[0]
      || null;
    if (!active) {
      return { vaults: [], activeVaultId: "", root: null, notes: [], error: "No franchise repos loaded" };
    }
    if (!active.exists) {
      return { vaults: all, activeVaultId: active.id, root: active.vaultRoot, notes: [], error: active.error };
    }
    const indexed = index(active.vaultRoot, refresh);
    const currentVaults = all.map((vault) => (
      vault.id === active.id ? { ...vault, noteCount: indexed.notes.length } : vault
    ));
    return {
      vaults: currentVaults,
      activeVaultId: active.id,
      root: active.vaultRoot,
      notes: indexed.notes.map((parsed) => parsed.note),
      error: null,
    };
  }

  function read(repoId: string | undefined, notePath: string): LoreNote | null {
    const vault = activeVault(repoId);
    if (!vault?.exists) return null;
    const file = safeResolve(vault.vaultRoot, notePath);
    if (!file || !NOTE_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;
    const relativePath = relativePosix(vault.vaultRoot, file);
    const parsed = index(vault.vaultRoot).byPath.get(relativePath);
    return parsed
      ? {
          ...parsed.note,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          headings: parsed.headings,
        }
      : null;
  }

  return { list, read };
}

export { MAX_NOTE_BYTES, MAX_NOTES, VAULT_ROOT_REL };
