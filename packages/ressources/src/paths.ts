import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const sourcesDir = resolve(packageRoot, "sources");
export const transcriptsDir = resolve(packageRoot, "transcripts");
export const derivativesDir = resolve(packageRoot, "derivatives");
export const templatesDir = resolve(packageRoot, "templates");

export function relativeToPackage(path: string): string {
  return path.startsWith(packageRoot) ? path.slice(packageRoot.length + 1) : path;
}
