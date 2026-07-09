# @shipshitgames/tester

A generic, browser-based QA harness for canvas/WebGL games. It opens a URL, waits
for a game-ready signal, drives keyboard/pointer input, captures screenshots,
detects blank renders, and emits an agent-readable report.

It is intentionally **app-agnostic**: there is no game-specific logic. Any game
(in this repo or elsewhere) is tested purely by URL + a small input script, so
the same tool works across every Ship Shit game.

Part of the open-source toolbox (see issues #96, #102).

## Install browsers

The package depends on `playwright`. Install the Chromium binary once:

```sh
cd packages/tester
bun install
bun run browsers   # playwright install chromium
```

## CLI

```sh
# from packages/tester
bun src/cli.ts --url http://localhost:5173 --ready flag:__GAME_READY__ \
  --press "Space" --hold "ArrowRight:1500" --frames 4 --out ./out

# or once linked as a bin
tester --url <url> [options]
```

Exit code is `0` when the run passes and `1` when it fails, so it drops straight
into CI or an agent loop.

### Ready signal (`--ready`, default `canvas`)

| Spec | Waits for |
| --- | --- |
| `canvas` | the `--canvas` selector to exist with non-zero layout size |
| `selector:<css>` | any element matching `<css>` to attach |
| `expr:<js>` | a JS expression evaluated in the page to be truthy |
| `flag:<window.path>` | a window flag, e.g. `flag:__GAME_READY__`, to be truthy |

Games here mount `<canvas id="scene">`, so a typical call uses `--canvas '#scene'`.
If a game exposes a readiness flag (e.g. `window.__GAME_READY__`), prefer
`--ready flag:__GAME_READY__` — it is the most reliable signal.

### Input

When `--script` is omitted, `--press`, `--hold`, and `--shot` build an input
script in the order written:

- `--press "ArrowUp,Space"` — press each key once
- `--hold "ArrowRight:1500"` — hold a key for N ms (repeatable)
- `--shot "name"` — capture a named screenshot (repeatable)

For complex sequences pass a JSON script with `--script <path|->` (`-` reads stdin):

```json
{
  "steps": [
    { "type": "wait", "ms": 500 },
    { "type": "press", "key": "Space" },
    { "type": "keydown", "key": "ArrowRight" },
    { "type": "wait", "ms": 1000 },
    { "type": "keyup", "key": "ArrowRight" },
    { "type": "screenshot", "name": "after-move" },
    { "type": "click", "selector": "#start" },
    { "type": "tap", "x": 240, "y": 160 }
  ]
}
```

### Blank detection

After the script and an observe window, the harness downscales the canvas and
analyzes it. A frame is **blank** when it is effectively one flat color or
transparent (too few distinct colors, or almost no non-background fill). Use
`--no-check-blank` to disable failing on blank, or tune `--blank-fill` /
`--blank-colors`.

> **WebGL note:** pixel sampling reads the canvas via an in-page `drawImage`.
> This is reliable for 2D canvases and for WebGL contexts created with
> `preserveDrawingBuffer: true`. For other WebGL games the captured PNG
> screenshot (which composites correctly) plus the game-ready signal remain the
> primary verification; blank detection may under-report. Prefer a `flag:` ready
> signal for those games.

### Output

A deterministic `--out` folder (default `game-test-output/`) receives:

- `report.json` — full structured report (`--report-json` to relocate)
- `report.md` — compact Markdown report for agent review (`--report-md`)
- `*.png` — every screenshot (named steps, `--frames`, and a final `final.png`)

## Programmatic API

```ts
import { runGameTest, buildMarkdownReport } from "@shipshitgames/tester";

const report = await runGameTest({
  url: "http://localhost:5173",
  ready: { kind: "flag", path: "__GAME_READY__" },
  canvasSelector: "#scene",
  script: { steps: [{ type: "press", key: "Space" }] },
  // ...see TesterOptions for the full set
});
if (!report.pass) console.error(buildMarkdownReport(report));
```

Also exported: `analyzePixels`, `parseInputScript` / `parseScriptJson`,
`summarizeReport`, and all report/option types.

## How agents should use it

1. Serve the game locally (e.g. `bun run dev` in the game) and grab its URL.
2. Run `tester` with a `flag:` ready signal when available, otherwise
   `--canvas '#scene'`.
3. Read `report.md` (or parse `report.json`): check `pass`, `ready.ok`,
   `canvas.stats.blank`, and any `pageErrors`. Inspect the screenshots in `out/`.

## Develop

```sh
bun test            # pure units always run; browser tests self-skip without Chromium
bun run typecheck
```
