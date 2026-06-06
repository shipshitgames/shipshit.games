export function flag(argv: string[], name: string, def?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

export function has(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

// Parse a positive-integer flag, falling back to `def` on missing/NaN/<=0.
export function intFlag(argv: string[], name: string, def: number): number {
  const raw = flag(argv, name);
  const n = raw === undefined ? def : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
