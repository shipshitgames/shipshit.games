# @shipshitgames/cli

Command-line entrypoint for Ship Shit Games tooling.

```bash
bun install -g @shipshitgames/cli
shipshitgames --help

npx @shipshitgames/cli --help
```

The CLI also exposes the short `ssg` bin.

## `ssg new` — scaffold a new game repo

Stamp a fresh game repository with the proven Ship Shit Games layout: agent
entry points, durable memory, curated skills, the lore submodule, and a git
repo.

```bash
ssg new ../my-game --name "My Game" --genre survivors
```

It creates:

- `AGENTS.md` and `.codex/instructions.md` — shared agent entry points.
- `.agents/` — `memory/` seed (`MEMORY.md`, `repo-boundary.md`), empty `SYSTEM/`
  and `SESSIONS/`, and `skills/` (`session-start`, `session-end`, `worktree`,
  `shipshit-engine`, `vibe-game-workflow`, and the chosen genre skill).
- `.claude/{skills,memory}` and `.codex/{skills,memory}` — symlinks into
  `.agents/`, so every agent shares one source of truth.
- `.gitmodules` — the Deadrot lore repo declared as a git submodule. Run
  `git submodule update --init <lore-path>` after cloning to fetch it.
- An initialized git repository.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--name <name>` | target dir name | Project name stamped into templates. |
| `--genre <genre>` | `action` | Genre skill to stamp (e.g. `survivors`, `shooter`, `rpg`). |
| `--lore-url <url>` | canonical Deadrot lore | Lore submodule URL. |
| `--lore-path <path>` | `.lore` | In-repo lore submodule path. |
| `--no-submodule` | — | Skip declaring the lore submodule. |
| `--no-git` | — | Skip `git init`. |
| `--force` | — | Stamp into a non-empty directory. |
| `--dry-run` | — | Print what would be created without writing. |

The lore submodule is only **declared** in `.gitmodules` (no network fetch), so
an out-of-date default URL is harmless until you run `git submodule update`.
`init` is an alias for `new`.

> **Windows:** the scaffolder wires `.claude/` and `.codex/` into `.agents/`
> with real symlinks. Run it from an elevated shell or with Developer Mode
> enabled, otherwise symlink creation fails with a clear error.
