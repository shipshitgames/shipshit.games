import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(engineDir, "../..");
const assetgenCli = join(repoRoot, "packages", "assetgen", "src", "cli.ts");
const enginePackage = JSON.parse(readFileSync(join(engineDir, "package.json"), "utf8"));
const threeVersion = process.argv[2];
const typesVersion = process.argv[3];
const partykitVersion = enginePackage.devDependencies?.partykit;
const typescriptVersion = enginePackage.devDependencies?.typescript;
const supportedVersions = new Map([
  ["0.169.0", "0.169.0"],
  ["0.184.0", "0.184.1"],
]);

if (supportedVersions.get(threeVersion) !== typesVersion) {
  throw new Error(
    `engine package smoke requires an explicit tested Three.js/@types pair (${[...supportedVersions].map(([three, types]) => `${three}/${types}`).join(", ")}); received ${threeVersion ?? "nothing"}/${typesVersion ?? "nothing"}`,
  );
}
if (typeof typescriptVersion !== "string") {
  throw new Error("engine package smoke requires a pinned TypeScript devDependency");
}
if (typeof partykitVersion !== "string") {
  throw new Error("engine package smoke requires a pinned PartyKit devDependency");
}

const smokeRoot = mkdtempSync(join(tmpdir(), `shipshit-engine-${threeVersion}-`));
const fixtureRepo = join(smokeRoot, "fixture-repo");
const packDir = join(smokeRoot, "pack");
const consumerDir = join(smokeRoot, "consumer");
const minimalConsumerDir = join(smokeRoot, "minimal-consumer");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });
  mkdirSync(minimalConsumerDir, { recursive: true });

  const assetgenEnv = { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" };
  delete assetgenEnv.ASSETGEN_IP;
  delete assetgenEnv.ASSETGEN_PROJECT_ROOT;
  delete assetgenEnv.ASSETGEN_PROJECTS;

  run(
    "bun",
    [
      assetgenCli,
      "generate",
      "--provider",
      "mock",
      "--id",
      "package-smoke-warden",
      "--prompt",
      "a Warden run cycle for the engine package smoke",
      "--game",
      "scourge-survivors",
      "--kind",
      "sprite",
      "--size",
      "128",
      "--views",
      "front,side,back",
      "--frames",
      "4",
      "--fps",
      "12",
      "--repo",
      fixtureRepo,
      "--usage-log",
      "off",
    ],
    { env: assetgenEnv },
  );

  run("bun", ["pm", "pack", "--destination", packDir], { cwd: engineDir });
  const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`expected one packed engine tarball, found ${tarballs.length}`);
  }

  const tarballPath = join(packDir, tarballs[0]);
  const fixturePath = join(fixtureRepo, "src", "assets", "assets.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const entry = fixture.assets?.find((asset) => asset.id === "package-smoke-warden");
  if (!entry || entry.kind !== "sprite-anim") {
    throw new Error("assetgen did not produce the expected packed sprite manifest entry");
  }

  copyFileSync(fixturePath, join(consumerDir, "assetgen-assets.json"));
  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "engine-package-smoke-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@shipshitgames/engine": `file:${tarballPath}`,
          three: threeVersion,
        },
        devDependencies: {
          "@types/three": typesVersion,
          partykit: partykitVersion,
          typescript: typescriptVersion,
        },
        scripts: {
          typecheck: "tsc --noEmit",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          strict: true,
          noEmit: true,
          resolveJsonModule: true,
          skipLibCheck: true,
        },
        include: ["smoke.ts"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerDir, "smoke.ts"),
    `import {
  AssetCatalog,
  RectBounds,
} from "@shipshitgames/engine";
import manifestSchema from "@shipshitgames/engine/assets-manifest.schema.json" with { type: "json" };
import { createRoomServer } from "@shipshitgames/engine/net/server";
import { PhysicsSystem } from "@shipshitgames/engine/physics";
import manifest from "./assetgen-assets.json" with { type: "json" };
import * as THREE from "three";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const resolvedEngine = import.meta.resolve("@shipshitgames/engine");
assert(
  /node_modules\\/[@]shipshitgames\\/engine\\/src\\/index[.]ts$/.test(resolvedEngine),
  "engine resolved outside the installed package: " + resolvedEngine,
);

const catalog = new AssetCatalog({
  entries: manifest.assets,
  load: async () => new THREE.Texture(),
});
const { texture, sheet } = await catalog.sprite("package-smoke-warden");

assert(texture instanceof THREE.Texture, "catalog did not return the consumer's Three.js texture");
assert(JSON.stringify(sheet.size) === "[128,128]", "assetgen sheet size drifted");
assert(JSON.stringify(sheet.frameSize) === "[32,32]", "assetgen frame size drifted");
assert(sheet.columns === 4, "assetgen columns drifted");
assert(sheet.rows === 4, "assetgen rows drifted");
assert(JSON.stringify(sheet.clips.all?.frames) === "[0,1,2,3]", "assetgen clip frames drifted");
assert(RectBounds.square(10).containsXZ(9, -9), "root export smoke failed");
assert(typeof createRoomServer === "function", "net/server export smoke failed");
assert(typeof PhysicsSystem.create === "function", "physics export smoke failed");
assert(manifestSchema.title === "@shipshitgames/engine assets manifest", "schema export smoke failed");

catalog.dispose();
console.log("engine tarball consumer passed with three ${threeVersion}");
`,
  );

  run("bun", ["install"], { cwd: consumerDir });
  run("bun", ["run", "typecheck"], { cwd: consumerDir });
  const output = run("bun", ["smoke.ts"], { cwd: consumerDir });
  if (!output.includes(`engine tarball consumer passed with three ${threeVersion}`)) {
    throw new Error(`consumer smoke did not report success:\n${output}`);
  }
  console.log(output);

  if (threeVersion === "0.184.0") {
    writeFileSync(
      join(minimalConsumerDir, "package.json"),
      `${JSON.stringify(
        {
          name: "engine-minimal-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@shipshitgames/engine": `file:${tarballPath}`,
            three: threeVersion,
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(minimalConsumerDir, "smoke.ts"),
      `import { RectBounds } from "@shipshitgames/engine";
import { createRoomServer } from "@shipshitgames/engine/net/server";

const resolvedEngine = import.meta.resolve("@shipshitgames/engine");
if (!/node_modules\\/[@]shipshitgames\\/engine\\/src\\/index[.]ts$/.test(resolvedEngine)) {
  throw new Error("engine resolved outside the installed package: " + resolvedEngine);
}
if (!RectBounds.square(10).containsXZ(9, -9)) {
  throw new Error("minimal root export smoke failed");
}
if (typeof createRoomServer !== "function") {
  throw new Error("net/server has an unexpected runtime PartyKit dependency");
}
console.log("minimal engine consumer passed without optional dependencies");
`,
    );

    run("bun", ["install", "--omit=optional"], { cwd: minimalConsumerDir });
    for (const dependency of ["@dimforge/rapier2d-compat", "howler", "partykit", "partysocket"]) {
      if (existsSync(join(minimalConsumerDir, "node_modules", dependency))) {
        throw new Error(`minimal consumer unexpectedly installed ${dependency}`);
      }
    }
    const minimalOutput = run("bun", ["smoke.ts"], { cwd: minimalConsumerDir });
    if (!minimalOutput.includes("minimal engine consumer passed without optional dependencies")) {
      throw new Error(`minimal consumer smoke did not report success:\n${minimalOutput}`);
    }
    console.log(minimalOutput);
  }
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
