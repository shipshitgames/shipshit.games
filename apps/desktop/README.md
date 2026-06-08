# Ship Shit Games Studio

Electron studio cockpit for Ship Shit Games.

## Terminal foundation

The desktop app runs a real shell through Electron IPC:

- `src/main/terminal-manager.ts` owns `node-pty` sessions and restricts
  write/resize/stop calls to the renderer process that created the terminal.
- `src/preload/index.ts` exposes a narrow `window.studio.terminal` bridge.
- `src/renderer/App.tsx` renders the bottom xterm.js terminal and fits it to the
  existing cockpit layout.

### Native `node-pty` rebuild (required)

`node-pty` is a native addon. Two things break it out of the box here:

1. **Bun skips dependency lifecycle scripts.** Without a `trustedDependencies`
   entry Bun never runs `node-pty`'s `install`/`postinstall`, so the addon is
   only ever the shipped prebuild.
2. **The prebuilt `spawn-helper` loses its executable bit.** Bun extracts the
   macOS prebuild's `spawn-helper` as mode `644`, so when `node-pty` execs it to
   open a PTY you get `node-pty failed to spawn …: posix_spawnp failed.` (The
   `.node` itself is N-API and loads fine — the helper is the blocker.)

`scripts/rebuild-native.cjs` fixes both by building `node-pty` **from source
against Electron's ABI** with `@electron/rebuild`. That produces
`build/Release/pty.node` **and** a `755` `build/Release/spawn-helper`, which
`node-pty`'s loader prefers over `prebuilds/`. The script is idempotent (it skips
when the addon is already built for the current Electron version) and runs
automatically before `dev`, `start`, and `package:mac`, plus on `postinstall`.

Run it manually after changing the Electron version or reinstalling:

```bash
cd apps/desktop
bun run rebuild:native
```

If your network blocks the default Electron headers host, point it at a mirror:

```bash
ELECTRON_HEADER_URL=https://registry.npmmirror.com/-/binary/electron/ bun run rebuild:native
```

### Verifying the working terminal path

`scripts/verify-terminal.ts` is an end-to-end check that runs under Electron's
own Node (`ELECTRON_RUN_AS_NODE`, no window/display needed). `verify:terminal`
bundles it to `dist/verify/index.cjs` first (Electron's raw Node can't load TS),
then it loads `node-pty`, starts a session through the production
`terminal-manager`, asserts `ok:true`
with a real `pid`, then runs `echo "SSG_VERIFY=$((6*7))"` and confirms the
streamed output contains `SSG_VERIFY=42` — proving the shell actually executed.

```bash
cd apps/desktop
bun run verify:terminal
```

Expected on success:

```
[verify] terminal:start ok=true id=… pid=… shell=/bin/zsh
[verify] PASS: real shell launched, returned a pid, and streamed live output under Electron's ABI.
```

Exit `0` = working, `1` = broken (e.g. the `posix_spawnp` failure above if the
rebuild has not run), `2` = the Electron binary is not downloaded yet.

CI runs this automatically: the `Desktop Terminal (node-pty)` job in
`.github/workflows/ci.yml` rebuilds the addon and runs `verify:terminal` on a
macOS runner, so an Electron/node-pty/lockfile bump that re-breaks the terminal
fails CI instead of shipping silently (the unit tests use a mock pty and cannot
catch a native regression). Exit `2` there is treated as a skip.

Other local checks:

```bash
cd apps/desktop
bun run test        # unit tests (terminal-manager with a mock pty)
bun run typecheck
bun run build
```

Run the dev shell (rebuilds the addon first, then launches Electron):

```bash
cd apps/desktop
bun run dev
```

## Ressources (Rules) pane

The Rules pane shells out to `packages/ressources/src/cli.ts`; it should keep
using the package CLI rather than duplicating transcript capture or distillation
logic in Electron.

```bash
brew tap shipshitgames/tap
brew install --cask shipshitgames-studio
```

Build the macOS release artifact (`asarUnpack` keeps `node-pty` unpacked so the
native addon and `spawn-helper` remain on disk inside the app bundle). The
`afterPack` hook (`scripts/after-pack.cjs`) then asserts the unpacked
`spawn-helper` is present and still executable, failing the build before a broken
`.dmg` can ship:

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

## Moodboards

The Moodboard pane keeps one reference board per game in Electron `userData`.
Imported images are copied into the app's moodboard storage and are not written
to any game's `src/assets` directory. Notes, item positions, and visual-target
markers persist across app restarts.
