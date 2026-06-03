/**
 * Minimal class-name combiner. Filters falsy values and joins with a space.
 * Dependency-free so the package stays lean.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
