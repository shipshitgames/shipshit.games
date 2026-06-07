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

## Local projects

The Projects pane registers local game repositories and resolves each target's
`src/assets/assets.json`. The desktop bridge validates the manifest against the
`@shipshitgames/engine` assets manifest schema, surfaces the asset catalog, and
routes sprite/audio generation to the active project's repo path.

The Homebrew cask should point at the signed/notarized `.dmg` uploaded to a
GitHub release.
