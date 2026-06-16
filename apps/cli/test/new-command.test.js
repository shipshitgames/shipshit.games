import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { runNewCommand } from "../src/new-command.js";

/** @type {string[]} */
const tempDirs = [];
/** @returns {string} */
function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), "ssg-newcmd-test-"));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

/** A minimal in-memory writable stream stand-in. */
function makeSink() {
  /** @type {string[]} */
  const chunks = [];
  return {
    /** @param {string | Uint8Array} chunk */
    write(chunk) {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    },
    text() {
      return chunks.join("");
    },
  };
}

test("runNewCommand --help prints usage and exits 0", () => {
  const out = makeSink();
  const err = makeSink();
  const code = runNewCommand(["--help"], {
    stdout: /** @type {any} */ (out),
    stderr: /** @type {any} */ (err),
  });
  assert.equal(code, 0);
  assert.match(out.text(), /shipshitgames new <dir>/);
  assert.equal(err.text(), "");
});

test("runNewCommand reports errors and exits 1", () => {
  const out = makeSink();
  const err = makeSink();
  const code = runNewCommand([], {
    stdout: /** @type {any} */ (out),
    stderr: /** @type {any} */ (err),
  });
  assert.equal(code, 1);
  assert.match(err.text(), /missing target directory/);
});

test("runNewCommand dry-run scaffolds nothing but summarizes", () => {
  const base = makeTemp();
  const out = makeSink();
  const err = makeSink();
  const code = runNewCommand(["game", "--dry-run", "--genre", "rpg", "--name", "Dry"], {
    stdout: /** @type {any} */ (out),
    stderr: /** @type {any} */ (err),
    cwd: base,
  });
  assert.equal(code, 0);
  assert.match(out.text(), /\[dry-run\] Scaffolded Dry \(rpg\)/);
  assert.ok(!existsSync(join(base, "game")));
});

test("runNewCommand stamps a repo and reports git + submodule", () => {
  const base = makeTemp();
  const out = makeSink();
  const code = runNewCommand(["game", "--genre", "shooter", "--name", "Sink Game"], {
    stdout: /** @type {any} */ (out),
    stderr: /** @type {any} */ (makeSink()),
    cwd: base,
  });
  assert.equal(code, 0);
  const text = out.text();
  assert.match(text, /Scaffolded Sink Game \(shooter\)/);
  assert.match(text, /lore submodule declared/);
  assert.match(text, /git: initialized/);
  assert.ok(existsSync(join(base, "game", "AGENTS.md")));
  assert.ok(existsSync(join(base, "game", ".agents/skills/shooter/SKILL.md")));
});
