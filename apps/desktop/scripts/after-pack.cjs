// electron-builder afterPack hook — assert node-pty survived packaging.
//
// The terminal bug class is entirely about the macOS `spawn-helper`: Bun strips
// its +x bit, and asar would hide it from node-pty altogether. `build.asarUnpack`
// keeps node-pty on disk, but nothing else verifies that the unpacked spawn-helper
// is actually present AND still executable inside the built bundle. This hook fails
// the build when it isn't, so a broken .dmg (terminal -> posix_spawnp failed) can't
// ship. It complements the dev-time check in verify-terminal.cjs, which the source
// tree exercises but a packaged bundle does not.

const fs = require("node:fs");
const path = require("node:path");
const { verifyPackagedTooling } = require("./verify-packaged-tooling.cjs");

exports.default = async function afterPack(context) {
  const root = context.appOutDir;

  const releaseDir = findNodePtyRelease(root);
  if (!releaseDir) {
    throw new Error(
      `[after-pack] node-pty/build/Release not found in the packaged app at ${root}. ` +
        "Ensure build.asarUnpack includes node-pty and run `bun run rebuild:native` before packaging.",
    );
  }

  const ptyNode = path.join(releaseDir, "pty.node");
  if (!fs.existsSync(ptyNode)) {
    throw new Error(`[after-pack] missing native addon ${ptyNode}`);
  }

  // spawn-helper only exists on unix (Windows uses conpty).
  if (process.platform !== "win32") {
    const helper = path.join(releaseDir, "spawn-helper");
    if (!fs.existsSync(helper)) {
      throw new Error(`[after-pack] missing spawn-helper at ${helper}`);
    }
    const mode = fs.statSync(helper).mode & 0o777;
    if (!(mode & 0o111)) {
      throw new Error(
        `[after-pack] spawn-helper is not executable (mode ${mode.toString(8)}) at ${helper}; ` +
          "the packaged terminal would fail with posix_spawnp.",
      );
    }
    console.log(`[after-pack] node-pty OK — pty.node + spawn-helper (mode ${mode.toString(8)}) unpacked`);
  } else {
    console.log("[after-pack] node-pty OK — pty.node unpacked");
  }
  verifyPackagedTooling(root, context.outDir);
};

// node-pty can sit under nested node_modules (Bun's symlink layout, dereferenced by
// electron-builder). Walk the packaged app for any .../node-pty/build/Release dir.
function findNodePtyRelease(root) {
  const target = path.join("node-pty", "build", "Release");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (full.endsWith(target)) return full;
      stack.push(full);
    }
  }
  return null;
}

module.exports.findNodePtyRelease = findNodePtyRelease;
