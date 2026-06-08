const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MIME_BY_EXT = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sanitizeGame(game) {
  const slug = String(game || "scourge-survivors")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "scourge-survivors";
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 4000);
}

function nextPlacement(count) {
  return {
    x: 80 + (count % 4) * 300,
    y: 80 + Math.floor(count / 4) * 240,
  };
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath || "").toLowerCase());
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function createMoodboardStore(options) {
  const now = options?.now || (() => new Date().toISOString());
  const makeId = options?.id || (() => crypto.randomUUID());
  const rootDir = () => {
    const root = typeof options?.rootDir === "function" ? options.rootDir() : options?.rootDir;
    if (!root) throw new Error("moodboard rootDir is required");
    return root;
  };

  function boardDir(game) {
    return path.join(rootDir(), sanitizeGame(game));
  }

  function boardPath(game) {
    return path.join(boardDir(game), "board.json");
  }

  function imageDir(game) {
    return path.join(boardDir(game), "images");
  }

  function normalizeItem(game, raw) {
    const type = raw?.type === "image" ? "image" : "note";
    const item = {
      id: String(raw?.id || makeId()),
      type,
      x: Number.isFinite(raw?.x) ? raw.x : 80,
      y: Number.isFinite(raw?.y) ? raw.y : 80,
      width: Math.max(160, Math.min(640, Number(raw?.width) || (type === "image" ? 260 : 240))),
      height: Math.max(120, Math.min(520, Number(raw?.height) || (type === "image" ? 190 : 160))),
      visualTarget: !!raw?.visualTarget,
      createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : now(),
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : now(),
    };

    if (type === "image") {
      const image = raw?.image || {};
      item.image = {
        name: String(image.name || "reference image"),
        path: String(image.path || ""),
        mime: String(image.mime || "application/octet-stream"),
      };
    } else {
      item.text = cleanText(raw?.text);
    }

    return item;
  }

  function publicItem(game, item) {
    if (item.type !== "image" || !item.image?.path) return item;
    const absolutePath = path.join(boardDir(game), item.image.path);
    let dataUrl = null;
    try {
      dataUrl = `data:${item.image.mime};base64,${fs.readFileSync(absolutePath).toString("base64")}`;
    } catch {}
    return { ...item, dataUrl };
  }

  function normalizeBoard(game, raw) {
    const safeGame = sanitizeGame(game || raw?.game);
    const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : now();
    const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt;
    const items = Array.isArray(raw?.items) ? raw.items.map((item) => normalizeItem(safeGame, item)) : [];
    return { game: safeGame, items, createdAt, updatedAt };
  }

  function readBoard(game) {
    const safeGame = sanitizeGame(game);
    const board = normalizeBoard(safeGame, safeReadJson(boardPath(safeGame), { game: safeGame, items: [] }));
    return { ...board, items: board.items.map((item) => publicItem(safeGame, item)) };
  }

  function writeBoard(board) {
    const safeGame = sanitizeGame(board?.game);
    const persisted = normalizeBoard(safeGame, { ...board, updatedAt: now() });
    fs.mkdirSync(boardDir(safeGame), { recursive: true });
    fs.writeFileSync(boardPath(safeGame), JSON.stringify(persisted, null, 2));
    return readBoard(safeGame);
  }

  function addNote(game, text) {
    const safeGame = sanitizeGame(game);
    const body = cleanText(text);
    const board = readBoard(safeGame);
    if (!body) return board;
    const place = nextPlacement(board.items.length);
    board.items.push({
      id: makeId(),
      type: "note",
      text: body,
      x: place.x,
      y: place.y,
      width: 260,
      height: 170,
      visualTarget: false,
      createdAt: now(),
      updatedAt: now(),
    });
    return writeBoard(board);
  }

  function importImages(game, filePaths) {
    const safeGame = sanitizeGame(game);
    const board = readBoard(safeGame);
    const files = Array.isArray(filePaths) ? filePaths.filter(isImageFile) : [];
    fs.mkdirSync(imageDir(safeGame), { recursive: true });
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      const id = makeId();
      const relativePath = path.join("images", `${id}${ext}`);
      const destination = path.join(boardDir(safeGame), relativePath);
      fs.copyFileSync(filePath, destination);
      const place = nextPlacement(board.items.length);
      board.items.push({
        id,
        type: "image",
        image: {
          name: path.basename(filePath),
          path: relativePath,
          mime: MIME_BY_EXT[ext] || "application/octet-stream",
        },
        x: place.x,
        y: place.y,
        width: 280,
        height: 210,
        visualTarget: false,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    return writeBoard(board);
  }

  function updateItem(game, patch) {
    const safeGame = sanitizeGame(game);
    const board = readBoard(safeGame);
    const id = String(patch?.id || "");
    const item = board.items.find((candidate) => candidate.id === id);
    if (!item) return board;
    if (Number.isFinite(patch.x)) item.x = Math.round(patch.x);
    if (Number.isFinite(patch.y)) item.y = Math.round(patch.y);
    if (Number.isFinite(patch.width)) item.width = Math.max(160, Math.min(640, Math.round(patch.width)));
    if (Number.isFinite(patch.height)) item.height = Math.max(120, Math.min(520, Math.round(patch.height)));
    if (typeof patch.text === "string" && item.type === "note") item.text = cleanText(patch.text);
    item.updatedAt = now();
    return writeBoard(board);
  }

  function setVisualTarget(game, id, visualTarget) {
    const safeGame = sanitizeGame(game);
    const board = readBoard(safeGame);
    const item = board.items.find((candidate) => candidate.id === String(id || ""));
    if (!item) return board;
    item.visualTarget = !!visualTarget;
    item.updatedAt = now();
    return writeBoard(board);
  }

  function removeItem(game, id) {
    const safeGame = sanitizeGame(game);
    const board = readBoard(safeGame);
    board.items = board.items.filter((item) => item.id !== String(id || ""));
    return writeBoard(board);
  }

  return {
    addNote,
    importImages,
    readBoard,
    removeItem,
    setVisualTarget,
    updateItem,
  };
}

module.exports = {
  createMoodboardStore,
  sanitizeGame,
};
