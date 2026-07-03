export function flag(argv: string[], name: string, def?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

export function flagValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  const flagName = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== flagName) continue;
    const value = argv[i + 1];
    if (value && !value.startsWith("-")) values.push(value);
  }
  return values;
}

export function shortFlagValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== `-${name}`) continue;
    for (let j = i + 1; j < argv.length && !argv[j]!.startsWith("-"); j++) {
      values.push(argv[j]!);
      i = j;
    }
  }
  return values;
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

// Parse a positive-float flag, falling back to `def` on missing/NaN/<=0.
export function numberFlag(argv: string[], name: string, def: number): number {
  const raw = flag(argv, name);
  const n = raw === undefined ? def : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : def;
}
