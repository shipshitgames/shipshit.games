import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createArtLabStore, sanitizeGame } from "./art-lab";

// A 1x1 webp encoded as a data URL — what studio:generate hands the renderer.
const FAKE_DATA_URL = "data:image/webp;base64,ZmFrZS13ZWJw"; // "fake-webp"

const temps = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-art-lab-"));
  temps.push(root);
  return root;
}

function fixedStore(root, ids = 0) {
  let n = ids;
  return createArtLabStore({ rootDir: root, now: () => "2026-06-17T00:00:00.000Z", id: () => `id-${++n}` });
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

test("sanitizes game slugs for lab storage", () => {
  expect(sanitizeGame("Scourge Survivors!!")).toBe("scourge-survivors");
  expect(sanitizeGame("")).toBe("scourge-survivors");
});

test("creates an empty lab for a game with no prior data", () => {
  const store = fixedStore(tempRoot());
  const lab = store.readLab("starblight");
  expect(lab.game).toBe("starblight");
  expect(lab.subject).toBe("");
  expect(lab.kind).toBe("sprite");
  expect(lab.variants).toEqual([]);
  expect(lab.lock).toBeNull();
});

test("sets the subject and kind, persisting across store instances", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  const lab = store.setSubject("pactfall", "a Warden sentinel mid-charge", "scene");
  expect(lab.subject).toBe("a Warden sentinel mid-charge");
  expect(lab.kind).toBe("scene");

  const reloaded = fixedStore(root).readLab("pactfall");
  expect(reloaded.subject).toBe("a Warden sentinel mid-charge");
  expect(reloaded.kind).toBe("scene");
});

test("adds a variant from a data URL, writing the image to disk and echoing a data URL back", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  const lab = store.addVariant("scourge-survivors", {
    direction: "hi-contrast rim light",
    prompt: "subject — hi-contrast rim light",
    provider: "fal",
    dataUrl: FAKE_DATA_URL,
    mime: "image/webp",
  });

  expect(lab.variants).toHaveLength(1);
  const variant = lab.variants[0];
  expect(variant.id).toBe("id-1");
  expect(variant.direction).toBe("hi-contrast rim light");
  expect(variant.provider).toBe("fal");
  expect(variant.score).toBe(0);
  expect(variant.locked).toBe(false);
  expect(variant.image.path).toBe(path.join("variants", "id-1.webp"));
  expect(variant.dataUrl).toBe(FAKE_DATA_URL);
  expect(fs.existsSync(path.join(root, "scourge-survivors", "variants", "id-1.webp"))).toBe(true);
});

test("copies a variant image from a source path when no data URL is given", () => {
  const root = tempRoot();
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-src-"));
  temps.push(sourceDir);
  const source = path.join(sourceDir, "render.png");
  fs.writeFileSync(source, "fake-png");

  const store = fixedStore(root);
  const lab = store.addVariant("redline", { direction: "neon", sourcePath: source, mime: "image/png" });
  const variant = lab.variants[0];
  expect(variant.image.path).toBe(path.join("variants", "id-1.png"));
  expect(variant.dataUrl).toBe(`data:image/png;base64,${Buffer.from("fake-png").toString("base64")}`);
});

test("scores, tags and annotates a variant with clamping and slugging", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("rothulk", { direction: "ash palette", dataUrl: FAKE_DATA_URL });

  store.scoreVariant("rothulk", "id-1", 9); // clamps to 5
  store.tagVariant("rothulk", "id-1", ["Hi Contrast", "warm", "warm", ""]); // slug + dedupe + drop empty
  const lab = store.annotateVariant("rothulk", "id-1", "best read at distance");

  const variant = lab.variants[0];
  expect(variant.score).toBe(5);
  expect(variant.tags).toEqual(["hi-contrast", "warm"]);
  expect(variant.note).toBe("best read at distance");
});

test("locks a variant into a pipeline-readable style-target contract", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.setSubject("deadlane", "a chrome interceptor", "sprite");
  store.addVariant("deadlane", { direction: "wet asphalt reflections", prompt: "subject — wet asphalt", dataUrl: FAKE_DATA_URL, mime: "image/webp" });

  const lab = store.lockVariant("deadlane", "id-1");
  expect(lab.variants[0].locked).toBe(true);
  expect(lab.lock).not.toBeNull();
  expect(lab.lock.variantId).toBe("id-1");
  expect(lab.lock.subject).toBe("a chrome interceptor");
  expect(lab.lock.direction).toBe("wet asphalt reflections");
  expect(lab.lock.image.path).toBe(path.join("locked", "id-1.webp"));
  expect(lab.lock.dataUrl).toBe(FAKE_DATA_URL);

  // The lock file + locked image survive a fresh store instance.
  const reloaded = fixedStore(root).readLock("deadlane");
  expect(reloaded.variantId).toBe("id-1");
  expect(fs.existsSync(path.join(root, "deadlane", "locked", "id-1.webp"))).toBe(true);
});

test("locking a new variant moves the lock and unmarks the previous one", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("scourge-survivors", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.addVariant("scourge-survivors", { direction: "b", dataUrl: FAKE_DATA_URL });

  store.lockVariant("scourge-survivors", "id-1");
  const lab = store.lockVariant("scourge-survivors", "id-2");
  expect(lab.variants.find((v) => v.id === "id-1").locked).toBe(false);
  expect(lab.variants.find((v) => v.id === "id-2").locked).toBe(true);
  expect(lab.lock.variantId).toBe("id-2");
});

test("clearLock removes the contract and unmarks every variant", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("starblight", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.lockVariant("starblight", "id-1");

  const lab = store.clearLock("starblight");
  expect(lab.lock).toBeNull();
  expect(lab.variants[0].locked).toBe(false);
  expect(fs.existsSync(path.join(root, "starblight", "lock.json"))).toBe(false);
});

test("clearLock deletes the copied locked image, leaving nothing behind", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("starblight", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.lockVariant("starblight", "id-1");
  const lockedImage = path.join(root, "starblight", "locked", "id-1.webp");
  expect(fs.existsSync(lockedImage)).toBe(true);

  store.clearLock("starblight");
  expect(fs.existsSync(lockedImage)).toBe(false);
});

test("re-locking a different variant removes the previous locked image", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("redline", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.addVariant("redline", { direction: "b", dataUrl: FAKE_DATA_URL });
  store.lockVariant("redline", "id-1");
  expect(fs.existsSync(path.join(root, "redline", "locked", "id-1.webp"))).toBe(true);

  store.lockVariant("redline", "id-2");
  expect(fs.existsSync(path.join(root, "redline", "locked", "id-1.webp"))).toBe(false);
  expect(fs.existsSync(path.join(root, "redline", "locked", "id-2.webp"))).toBe(true);
});

test("a data URL's own mime is authoritative even if a conflicting mime is passed", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  // Caller mislabels webp bytes as png; the stored + echoed mime must follow the bytes.
  const lab = store.addVariant("rothulk", { direction: "a", dataUrl: FAKE_DATA_URL, mime: "image/png" });
  const variant = lab.variants[0];
  expect(variant.image.mime).toBe("image/webp");
  expect(variant.image.path).toBe(path.join("variants", "id-1.webp"));
  expect(variant.dataUrl).toBe(FAKE_DATA_URL);
});

test("removing the locked variant drops both the variant and the lock", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("pactfall", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.addVariant("pactfall", { direction: "b", dataUrl: FAKE_DATA_URL });
  store.lockVariant("pactfall", "id-1");

  const lab = store.removeVariant("pactfall", "id-1");
  expect(lab.variants).toHaveLength(1);
  expect(lab.variants[0].id).toBe("id-2");
  expect(lab.lock).toBeNull();
  expect(fs.existsSync(path.join(root, "pactfall", "variants", "id-1.webp"))).toBe(false);
});

test("removing a non-locked variant leaves the lock intact", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("redline", { direction: "a", dataUrl: FAKE_DATA_URL });
  store.addVariant("redline", { direction: "b", dataUrl: FAKE_DATA_URL });
  store.lockVariant("redline", "id-1");

  const lab = store.removeVariant("redline", "id-2");
  expect(lab.variants).toHaveLength(1);
  expect(lab.lock.variantId).toBe("id-1");
});

test("ignores mutations targeting an unknown variant id", () => {
  const root = tempRoot();
  const store = fixedStore(root);
  store.addVariant("rothulk", { direction: "a", dataUrl: FAKE_DATA_URL });
  const lab = store.scoreVariant("rothulk", "missing", 4);
  expect(lab.variants[0].score).toBe(0);
  expect(store.lockVariant("rothulk", "missing").lock).toBeNull();
});

test("requires a rootDir", () => {
  const store = createArtLabStore({});
  expect(() => store.readLab("scourge-survivors")).toThrow("art-lab rootDir is required");
});
