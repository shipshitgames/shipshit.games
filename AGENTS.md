# Ship Shit Games - Studio Repo - Agent Instructions

Scope: this entire `shipshitgames` repository.

## Agent Entry Point

- At the start of every session, inspect `.agents/` and read the active project
  memory and rules before doing task work:
  - `.agents/memory/MEMORY.md`
  - `.agents/memory/captured-rules.md`
  - `.agents/memory/repo-boundary.md`
- Read the relevant `.agents/skills/*/SKILL.md` file before using a local skill.
- Read the latest relevant `.agents/SESSIONS/*.md` entry when resuming or
  debugging prior work.
- Read `.agents/memory/repo-boundary.md` before moving apps, packages, or assets.
- Claude Code: read `CLAUDE.md`, then follow this file.
- Codex: read `CODEX.md`, then follow this file.
- Other coding agents: follow this `AGENTS.md`.
- Cursor: `.cursorignore` keeps generated files, lockfiles, and secrets out of indexed context.

## Project Role

- This is the studio/tooling monorepo: `apps/web`, `apps/app`, `apps/desktop`, tooling packages, and studio-only shared packages.
- `packages/ui` is the published React UI package: `@shipshitgames/ui`.
- `packages/assetgen` is the reusable asset generation core and CLI entrypoint.
  It stays here so the studio can ship and dogfood the CLI.
- Deadrot shipped games, assets, and runtime packages belong in sibling repo `../deadrotcom`.

## Canon And Design

- Deadrot canon lives in `../deadrotcom/apps/lore/content`, the Obsidian vault root.
- The Scourge are parasites and host-takeover organisms, not generic monsters.
- Scourge art can include many conquered species and soldier forms, but every form must read as parasitic takeover.
- Toxic green belongs to the Scourge. Pyre/Warden UI and environments should stay in black, bone, blood red, hellfire orange, and gunmetal.

## Engineering Rules

- Use Bun for package management unless a subproject explicitly requires npm.
- Do not introduce workaround, escape-hatch, or temporary production
  configuration as a fix. Prefer the clean canonical solution, even when it
  takes longer.
- Do not add shipped Deadrot assets here; write them to `../deadrotcom/packages/assets`.
- Do not move `packages/assetgen` into Deadrot; keep it as the studio CLI product.
- Do not treat runtime package copies in this repo as the Deadrot shipping source of truth unless the user explicitly says otherwise.
- Keep React in UI overlays and app shells; keep gameplay loops imperative and Three.js-centered.
- Do not commit secrets, `.env` files, generated `dist`, `node_modules`, or local editor state.
- Inspect `git status` before edits and commit only the requested scope.

## GitHub Workflow

- When picking up a GitHub issue or project board item, move it to `In Progress`
  before starting implementation.

## Useful Commands

- `bun install`
- `bun run build`
- `bun run typecheck`
- `cd packages/ui && bun run typecheck`
- `cd packages/engine && bun run typecheck`
