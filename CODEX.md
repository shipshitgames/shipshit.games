# Codex Instructions

Read `AGENTS.md` first. This file exists so Codex uses the same project rules as
Claude Code, Cursor, and other agents.

At the start of every session, inspect `.agents/` and read the active project
memory and rules before doing task work:

- `.agents/memory/MEMORY.md`
- `.agents/memory/captured-rules.md`
- `.agents/memory/repo-boundary.md`

Read the relevant `.agents/skills/*/SKILL.md` file before using a local skill.
Read the latest relevant `.agents/SESSIONS/*.md` entry when resuming or
debugging prior work.

Follow `AGENTS.md` as the source of truth for repo-wide engineering rules.
