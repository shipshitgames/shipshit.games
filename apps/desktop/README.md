# Ship Shit Games Studio

Electron studio cockpit for Ship Shit Games.

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

The Homebrew cask should point at the signed/notarized `.dmg` uploaded to a
GitHub release.
