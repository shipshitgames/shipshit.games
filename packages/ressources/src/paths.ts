import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const sourcesDir = resolve(packageRoot, "sources");
export const transcriptsDir = resolve(packageRoot, "transcripts");
export const derivativesDir = resolve(packageRoot, "derivatives");
export const templatesDir = resolve(packageRoot, "templates");
export const schemasDir = resolve(packageRoot, "schemas");

export function relativeToPackage(path: string): string {
  return path.startsWith(packageRoot) ? path.slice(packageRoot.length + 1) : path;
}

export function isPathInside(root: string, path: string): boolean {
  const child = relative(root, path);
  return (
    child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))
  );
}

export function relativeToRoot(root: string, path: string): string {
  if (!isPathInside(root, path)) {
    throw new Error(`output path must stay inside the ressources root: ${path}`);
  }
  return relative(root, path);
}
