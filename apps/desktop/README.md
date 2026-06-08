# Ship Shit Games Studio

Electron studio cockpit for Ship Shit Games.

<<<<<<< HEAD
## Terminal foundation

The desktop app runs a real shell through Electron IPC:

- `electron/terminal-manager.cjs` owns `node-pty` sessions and restricts
  write/resize/stop calls to the renderer process that created the terminal.
- `electron/preload.cjs` exposes a narrow `window.studio.terminal` bridge.
- `src/App.tsx` renders the bottom xterm.js terminal and fits it to the
  existing cockpit layout.

Useful local checks:

```bash
cd apps/desktop
bun run test
bun run typecheck
bun run build
```

Run the dev shell:

```bash
cd apps/desktop
bun run dev
```

If the terminal pane reports a `node-pty failed to spawn` error, rebuild the
native dependency in an unsigned/local Node environment before retrying the
desktop app.

## Ressources (Rules) pane

The Rules pane shells out to `packages/ressources/src/cli.ts`; it should keep
using the package CLI rather than duplicating transcript capture or distillation
logic in Electron.

```bash
brew tap shipshitgames/tap
brew install --cask shipshitgames-studio
```

Build the macOS release artifact:

```bash
bun install
cd apps/desktop
bun run package:mac
```

## Local projects

The Projects pane registers local game repositories and resolves each target's
`src/assets/assets.json`. The desktop bridge validates the manifest against the
`@shipshitgames/engine` assets manifest schema, surfaces the asset catalog, and
routes sprite/audio generation to the active project's repo path.

The Homebrew cask should point at the signed/notarized `.dmg` uploaded to a
GitHub release.
