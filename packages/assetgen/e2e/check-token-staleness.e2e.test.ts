import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

async function runCli(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Absolute cli path so the command resolves regardless of the spawned cwd.
  const proc = Bun.spawn(["bun", cliPath, "check-token-staleness", ...args], {
    cwd: opts.cwd ?? pkgDir,
    env: { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** A banner-stamped CSS consumer at a given version. */
function consumer(version: string): string {
  return `/* GENERATED FROM DESIGN.md v${version} for app token consumers. DO NOT EDIT BY HAND. */\n:root { --void: #0a0a0a; }\n`;
}

/** Report shape emitted by `--json`. */
type Report = {
  ok: boolean;
  canonVersion: string;
  results: { file: string; status: string; version: string | null }[];
};

test("e2e: the gate passes when every vendored consumer matches canon", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-ok-"));
  try {
    const a = join(dir, "web.css");
    const b = join(dir, "desktop.css");
    await writeFile(a, consumer("0.1.0"));
    await writeFile(b, consumer("0.1.0"));

    const res = await runCli(["--canon", "0.1.0", "--files", `${a},${b}`]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /CURRENT/);
    assert.match(res.stdout, /all consumers current with canon v0\.1\.0/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: the gate fails (exit 1) when a vendored consumer is behind canon", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-stale-"));
  try {
    const stale = join(dir, "web.css");
    await writeFile(stale, consumer("0.1.0"));

    const res = await runCli(["--canon", "0.2.0", stale]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /STALE/);
    assert.match(res.stderr, /vendored tokens are behind canon v0\.2\.0/);
    assert.match(res.stderr, /bun assetgen tokens/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: --json emits a machine report and still exits non-zero on staleness", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-json-"));
  try {
    const stale = join(dir, "web.css");
    const fresh = join(dir, "desktop.css");
    await writeFile(stale, consumer("0.1.0"));
    await writeFile(fresh, consumer("0.2.0"));

    const res = await runCli(["--canon", "0.2.0", "--files", `${stale},${fresh}`, "--json"]);
    assert.equal(res.exitCode, 1);
    const report = JSON.parse(res.stdout) as Report;
    assert.equal(report.ok, false);
    assert.equal(report.canonVersion, "0.2.0");
    assert.deepEqual(
      report.results.map((r) => r.status),
      ["stale", "current"],
    );
    // The human summary stays out of stdout under --json.
    assert.doesNotMatch(res.stdout, /vendored tokens are behind/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: a banner-less consumer fails the gate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-nobanner-"));
  try {
    const file = join(dir, "hand.css");
    await writeFile(file, ":root { --void: #0a0a0a; }\n");

    const res = await runCli(["--canon", "0.1.0", file]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /NO-BANNER/);
    assert.match(res.stderr, /no-banner/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: the gate resolves canon from a DESIGN.md and compares against it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-design-"));
  try {
    const designPath = join(dir, "DESIGN.md");
    const file = join(dir, "web.css");
    await writeFile(designPath, `---\nversion: "0.4.0"\nname: "T"\ncolors:\n  primary: "#c1121f"\n---\n\n# T\n`);
    await writeFile(file, consumer("0.3.0"));

    const res = await runCli(["--design", designPath, file]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /behind canon v0\.4\.0/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: a relative file path resolves against the caller's cwd, not the assetgen root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-cwd-"));
  try {
    await writeFile(join(dir, "tokens.css"), consumer("0.2.0"));
    // Run from the vendored repo with a bare relative path. This must resolve
    // against cwd (the temp dir), not the monorepo root, or it reports MISSING.
    const res = await runCli(["--canon", "0.2.0", "tokens.css"], { cwd: dir });
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /CURRENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: --files and trailing positional paths are both checked, in order, without re-collecting the flag value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-mix-"));
  try {
    const a = join(dir, "a.css");
    const b = join(dir, "b.css");
    const c = join(dir, "c.css");
    await writeFile(a, consumer("0.1.0"));
    await writeFile(b, consumer("0.1.0"));
    await writeFile(c, consumer("0.1.0"));

    const res = await runCli(["--canon", "0.1.0", "--files", `${a},${b}`, c, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as Report;
    // Exactly three: the `--files` value is not re-collected as a positional.
    assert.equal(report.results.length, 3);
    assert.deepEqual(
      report.results.map((r) => r.status),
      ["current", "current", "current"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: --json on a passing run exits 0, reports ok=true, and omits the human summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-jsonok-"));
  try {
    const a = join(dir, "web.css");
    await writeFile(a, consumer("0.1.0"));

    const res = await runCli(["--canon", "0.1.0", "--files", a, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as Report;
    assert.equal(report.ok, true);
    // A machine consumer relies on stdout being pure JSON on success.
    assert.doesNotMatch(res.stdout, /all consumers current/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: an explicit but empty --files selector fails loudly instead of falling back to defaults", async () => {
  const res = await runCli(["--canon", "0.1.0", "--files", " "]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /resolved to no file paths/);
  // It must NOT silently check the monorepo default consumers.
  assert.doesNotMatch(res.stdout, /apps\/web\/app\/theme\.css/);
});

test("e2e: the assetgen lore/DESIGN.md banner format parses end-to-end through the CLI", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-lore-"));
  try {
    const file = join(dir, "tokens.css");
    await writeFile(
      file,
      "/* GENERATED FROM lore/DESIGN.md v0.2.0 hash:73277f2a - DO NOT EDIT. Run: bun assetgen tokens */\n:root {}\n",
    );

    const res = await runCli(["--canon", "0.2.0", file]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /CURRENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: a consumer ahead of canon prints AHEAD and still passes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-ahead-"));
  try {
    const file = join(dir, "web.css");
    await writeFile(file, consumer("0.3.0"));

    const res = await runCli(["--canon", "0.2.0", file]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /AHEAD/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: a mixed failure set names every failing consumer in the summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-e2e-multi-"));
  try {
    const stale = join(dir, "stale.css");
    const missing = join(dir, "missing.css");
    await writeFile(stale, consumer("0.1.0"));

    const res = await runCli(["--canon", "0.2.0", "--files", `${stale},${missing}`]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /stale\.css is stale at v0\.1\.0/);
    assert.match(res.stderr, /missing\.css is missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: the default consumer set (committed repo) is current", async () => {
  // No --files / --canon: resolves the real DESIGN.md and the committed
  // game-brand token consumers. The desktop cockpit has its own independent
  // theme and must not be pulled back into this gate.
  const res = await runCli([]);
  assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /apps\/web\/app\/theme\.css/);
  assert.doesNotMatch(res.stdout, /apps\/desktop\/src\/renderer\//);
});
