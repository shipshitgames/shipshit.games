import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templateSkill = resolve(here, "../templates/dot-agents/skills/worktree");
const repoSkill = resolve(here, "../../../.agents/skills/worktree");
const scriptRel = "scripts/create-worktree.sh";

test("worktree skill template mirrors the repo skill", () => {
	for (const rel of ["SKILL.md", scriptRel]) {
		assert.equal(
			readFileSync(join(templateSkill, rel), "utf8"),
			readFileSync(join(repoSkill, rel), "utf8"),
			`${rel} drifted between .agents/skills/worktree and the CLI template`,
		);
	}
});

test("worktree script and docs create worktrees outside the repository", () => {
	const script = readFileSync(join(templateSkill, scriptRel), "utf8");
	const skill = readFileSync(join(templateSkill, "SKILL.md"), "utf8");

	assert.match(script, /GIT_WT_HOME/);
	assert.doesNotMatch(script, /\$TOPLEVEL\/\.worktrees/);
	assert.match(script, /WTDIR="\$WT_ROOT\//);
	assert.doesNotMatch(skill, /git worktree remove \.worktrees/);
	assert.doesNotMatch(skill, /<repo-root>\/\.worktrees/);
});

test("worktree script is self-contained and parses", () => {
	const script = join(templateSkill, scriptRel);
	assert.doesNotMatch(readFileSync(script, "utf8"), /\.agent-config/);
	const result = spawnSync("bash", ["-n", script], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
});
