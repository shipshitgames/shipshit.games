# Ship Shit Games Studio

Electron studio cockpit for Ship Shit Games.

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
