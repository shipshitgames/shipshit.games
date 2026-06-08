# Ship Shit Games Studio

Electron studio cockpit for Ship Shit Games.

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

The Homebrew cask should point at the signed/notarized `.dmg` uploaded to a
GitHub release.
