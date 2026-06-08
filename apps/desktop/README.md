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

## Moodboards

The Moodboard pane keeps one reference board per game in Electron `userData`.
Imported images are copied into the app's moodboard storage and are not written
to any game's `src/assets` directory. Notes, item positions, and visual-target
markers persist across app restarts.
