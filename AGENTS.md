# Ship Shit Games - Studio Repo - Agent Instructions

Scope: this entire `shipshitgames` repository.

## Agent Entry Point

- Claude Code: read `CLAUDE.md`, then follow this file.
- Codex and other coding agents: follow this `AGENTS.md`.
- Cursor: `.cursorignore` keeps generated files, lockfiles, and secrets out of indexed context.

## Project Role

- This is the studio platform monorepo: `apps/web`, `apps/warline`, desktop tooling, and shared packages.
- `packages/ui` is the published React UI package: `@shipshitgames/ui`.
- `packages/engine` is the shared Three.js game engine package: `@shipshitgames/engine`.
- `packages/assetgen` and `packages/assets` support the asset and sprite workflow.

## Canon And Design

- The sibling `../lore` repo is the source of truth for universe canon.
- The Scourge are parasites and host-takeover organisms, not generic monsters.
- Scourge art can include many conquered species and soldier forms, but every form must read as parasitic takeover.
- Toxic green belongs to the Scourge. Pyre/Warden UI and environments should stay in black, bone, blood red, hellfire orange, and gunmetal.

## Engineering Rules

- Use Bun for package management unless a subproject explicitly requires npm.
- Prefer shared packages over local duplication: `@shipshitgames/ui` for React UI and `@shipshitgames/engine` for shared game systems.
- Keep React in UI overlays and app shells; keep gameplay loops imperative and Three.js-centered.
- Do not commit secrets, `.env` files, generated `dist`, `node_modules`, or local editor state.
- Inspect `git status` before edits and commit only the requested scope.

## Useful Commands

- `bun install`
- `bun run build`
- `bun run typecheck`
- `cd packages/ui && bun run typecheck`
- `cd packages/engine && bun run typecheck`
