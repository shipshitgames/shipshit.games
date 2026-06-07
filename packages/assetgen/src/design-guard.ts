import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const IGNORED_DIRS = new Set([".git", ".next", "coverage", "dist", "node_modules", "out"]);
const ROOT_DESIGN_PATH = "DESIGN.md";
const LORE_DESIGN_PATHS = new Set(["lore/DESIGN.md", ".agents/lore/DESIGN.md"]);

export interface DesignDocViolation {
  path: string;
}

export async function findDisallowedDesignDocs(root: string): Promise<DesignDocViolation[]> {
  const designDocs: DesignDocViolation[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
        continue;
      }

      if (!entry.isFile() || entry.name !== "DESIGN.md") continue;

      const path = join(dir, entry.name);
      const repoPath = toRepoPath(relative(root, path));
      if (await hasYamlFrontmatter(path)) designDocs.push({ path: repoPath });
    }
  }

  await walk(root);
  const hasLoreDesign = designDocs.some((doc) => LORE_DESIGN_PATHS.has(doc.path));
  return designDocs
    .filter((doc) => !LORE_DESIGN_PATHS.has(doc.path))
    .filter((doc) => doc.path !== ROOT_DESIGN_PATH || hasLoreDesign)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function assertNoDisallowedDesignDocs(root: string): Promise<void> {
  const violations = await findDisallowedDesignDocs(root);
  if (violations.length === 0) return;

  const list = violations.map((v) => `  - ${v.path}`).join("\n");
  throw new Error(
    `Only one authored frontmatter DESIGN.md may exist. Keep the reviewed root DESIGN.md until lore/DESIGN.md is wired, then remove stale copies:\n${list}`,
  );
}

async function hasYamlFrontmatter(path: string): Promise<boolean> {
  const text = await readFile(path, "utf8");
  return /^---\r?\n/.test(text);
}

function toRepoPath(path: string): string {
  return path.split("\\").join("/");
}
