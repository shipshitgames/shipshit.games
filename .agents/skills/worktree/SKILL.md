---
name: worktree
description: Create a git worktree for a GitHub issue or PR, branched off develop (falling back to master, then main). Use when picking up a ticket — e.g. "/worktree https://github.com/owner/repo/issues/65" creates branch feat/65-<slug> in .worktrees/ and switches into it.
license: MIT
compatibility: Requires git and an authenticated gh CLI.
metadata:
  version: "1.0.0"
  tags: "git, worktree, github, branching, workflow"
  author: Ship Shit Dev
allowed-tools: Bash(git *) Bash(gh *) Bash(bash *) Bash(.agents/skills/worktree/scripts/create-worktree.sh*)
when_to_use: "/worktree, start a github issue, pick up a ticket, create a worktree for issue, branch for PR, new feature branch from develop"
disable-model-invocation: true
---

# Worktree

Spin up an isolated git worktree for a GitHub issue or PR so a feature can be built
without disturbing the current checkout. The branch name and base branch are derived
automatically; the session then moves into the new worktree.

## Contract

Inputs:

- A GitHub issue/PR reference (required). Any of: a full issue/PR URL,
  `owner/repo#65`, `#65`, or a bare number `65`.
- An optional branch type prefix (default `feat`).

Outputs:

- A new worktree directory and a printed `WORKTREE_PATH=` / `BRANCH=` summary.
- The session relocated into the new worktree.

Creates/Modifies:

- A new branch `<type>/<number>-<slug>`.
- A worktree at `<repo-root>/.worktrees/<branch-with-slashes-as-dashes>` (gitignored).

External Side Effects:

- Reads the issue/PR title from GitHub (`gh api`). Fetches `origin`. No writes to GitHub.

Confirmation Required:

- None for creation. Confirm before deleting or replacing an existing worktree.

Delegates To:

- `session-start` once inside the new worktree, to load context for the picked-up work.

## Naming and base rules

- **Branch**: `<type>/<number>-<slug>`, where `<slug>` is the slugified issue title,
  lowercased, non-alphanumerics collapsed to `-`, capped at 50 chars.
  Example: issue #65 "Add login screen" → `feat/65-add-login-screen`.
- **Type**: defaults to `feat`. Pass a second argument to override (e.g. `fix`, `chore`).
- **Base branch**: the first of `develop`, `master`, `main` that exists wins
  (remote-tracking preferred over local). `develop` → `master` is the primary intent;
  `main` is a fallback for repos that use it.
- **Location**: `.worktrees/` under the repo root, kept out of version control. This
  sits outside the `apps/*` / `packages/*` workspace globs, so Bun and Turbo ignore it.

## Workflow

### 1. Create the worktree

Run the helper script with the issue reference (and optional type):

```bash
.agents/skills/worktree/scripts/create-worktree.sh "<issue-ref>" [type]
```

Examples:

```bash
.agents/skills/worktree/scripts/create-worktree.sh "https://github.com/shipshitgames/shipshitgames/issues/65"
.agents/skills/worktree/scripts/create-worktree.sh "#65" fix
```

The script resolves the title, picks the base branch, creates the branch + worktree,
and prints `BRANCH=` and `WORKTREE_PATH=` on its final lines.

### 2. Move into the worktree

Switch the session's working directory to the printed `WORKTREE_PATH` so all
subsequent work happens on the new branch. In Claude Code, enter the worktree; other
agents `cd` into it.

### 3. Install dependencies if needed

A fresh worktree has no `node_modules`. If the picked-up work needs to build or run,
install dependencies in the new worktree:

```bash
bun install
```

### 4. Load context

Run `session-start` from inside the new worktree to load repo memory and recent
session notes before beginning the feature.

## Cleanup

When the feature is merged or abandoned, remove the worktree from the repo root:

```bash
git worktree remove .worktrees/<branch-with-slashes-as-dashes>
```

Add `--force` only if the worktree has uncommitted changes you intend to discard.

## Notes

- The GitHub issues endpoint serves both issues and pull requests, so a PR number works too.
- If neither `develop`, `master`, nor `main` exists, the script stops rather than guessing a base.
- Re-running for the same issue reuses the existing worktree instead of failing.
