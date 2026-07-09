import { randomUUID } from "node:crypto";

import { IPC_CHANNELS } from "../shared/ipc";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 24;
const MIN_COLS = 20;
const MAX_COLS = 240;
const MIN_ROWS = 5;
const MAX_ROWS = 80;

function clampInteger(value, fallback, min, max) {
  const next = Number.parseInt(String(value), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function normalizeTerminalSize(size: any = {}) {
  return {
    cols: clampInteger(size.cols, DEFAULT_COLS, MIN_COLS, MAX_COLS),
    rows: clampInteger(size.rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS),
  };
}

function terminalShell(platform = process.platform, env = process.env) {
  if (platform === "win32") return env.COMSPEC || "cmd.exe";
  return env.SHELL || "/bin/zsh";
}

function send(webContents, channel, payload) {
  if (!webContents || webContents.isDestroyed?.()) return;
  webContents.send(channel, payload);
}

function senderId(webContents) {
  return Number.isInteger(webContents?.id) ? webContents.id : null;
}

function createTerminalManager(options: any = {}) {
  const sessions = new Map();
  const pty = options.pty;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const shell = options.shell || terminalShell(process.platform, env);
  const randomId = options.randomId || randomUUID;

  function ownedSession(webContents, id) {
    const session = sessions.get(id);
    if (!session) return null;
    return session.webContentsId === senderId(webContents) ? session : null;
  }

  function start(webContents, opts: any = {}) {
    if (!pty?.spawn) {
      return { ok: false, error: "node-pty is unavailable" };
    }

    const { cols, rows } = normalizeTerminalSize(opts);
    const sessionCwd = typeof opts.cwd === "string" && opts.cwd.trim() ? opts.cwd : cwd;
    const id = randomId();
    let child;
    try {
      child = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: sessionCwd,
        env: {
          ...env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
    } catch (error) {
      return {
        ok: false,
        error: `node-pty failed to spawn ${shell}: ${error?.message || error}`,
      };
    }

    sessions.set(id, {
      pty: child,
      webContentsId: senderId(webContents),
    });

    child.onData((data) => {
      send(webContents, IPC_CHANNELS.terminalData, { id, data });
    });
    child.onExit((event: any = {}) => {
      sessions.delete(id);
      send(webContents, IPC_CHANNELS.terminalExit, {
        id,
        exitCode: event.exitCode ?? null,
        signal: event.signal ?? null,
      });
    });

    return {
      ok: true,
      id,
      pid: child.pid ?? null,
      shell,
      cwd: sessionCwd,
      cols,
      rows,
    };
  }

  function write(webContents, id, data) {
    const session = ownedSession(webContents, id);
    if (!session || typeof data !== "string") return false;
    session.pty.write(data);
    return true;
  }

  function resize(webContents, id, size) {
    const session = ownedSession(webContents, id);
    if (!session || typeof session.pty.resize !== "function") return false;
    const { cols, rows } = normalizeTerminalSize(size);
    session.pty.resize(cols, rows);
    return true;
  }

  function stop(webContents, id) {
    const session = ownedSession(webContents, id);
    if (!session) return false;
    sessions.delete(id);
    session.pty.kill();
    return true;
  }

  function disposeForWebContents(webContentsId) {
    for (const [id, session] of sessions.entries()) {
      if (session.webContentsId === webContentsId) {
        sessions.delete(id);
        session.pty.kill();
      }
    }
  }

  function disposeAll() {
    for (const [id, session] of sessions.entries()) {
      sessions.delete(id);
      session.pty.kill();
    }
  }

  return {
    start,
    write,
    resize,
    stop,
    disposeForWebContents,
    disposeAll,
    count: () => sessions.size,
  };
}

export {
  createTerminalManager,
  normalizeTerminalSize,
  terminalShell,
};
