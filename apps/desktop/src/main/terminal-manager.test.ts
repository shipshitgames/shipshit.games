import { describe, expect, test } from "bun:test";
import { createTerminalManager, normalizeTerminalSize, terminalShell } from "./terminal-manager";

function mockWebContents(id) {
  return {
    id,
    destroyed: false,
    sent: [],
    isDestroyed() {
      return this.destroyed;
    },
    send(channel, payload) {
      this.sent.push({ channel, payload });
    },
  };
}

function mockPty() {
  const children = [];
  return {
    children,
    pty: {
      spawn(shell, args, opts) {
        const listeners = { data: [], exit: [] };
        const child = {
          pid: 42 + children.length,
          shell,
          args,
          opts,
          writes: [],
          resizes: [],
          killed: false,
          onData(cb) {
            listeners.data.push(cb);
          },
          onExit(cb) {
            listeners.exit.push(cb);
          },
          write(data) {
            this.writes.push(data);
          },
          resize(cols, rows) {
            this.resizes.push({ cols, rows });
          },
          kill() {
            this.killed = true;
            for (const cb of listeners.exit) cb({ exitCode: 0, signal: null });
          },
          emitData(data) {
            for (const cb of listeners.data) cb(data);
          },
        };
        children.push(child);
        return child;
      },
    },
  };
}

describe("terminal manager", () => {
  test("normalizes terminal sizes", () => {
    expect(normalizeTerminalSize({ cols: 5, rows: 500 })).toEqual({ cols: 20, rows: 80 });
    expect(normalizeTerminalSize({ cols: 132, rows: 40 })).toEqual({ cols: 132, rows: 40 });
    expect(normalizeTerminalSize({ cols: "nope", rows: undefined })).toEqual({ cols: 100, rows: 24 });
  });

  test("picks the platform shell", () => {
    expect(terminalShell("darwin", { SHELL: "/bin/zsh" })).toBe("/bin/zsh");
    expect(terminalShell("linux", {})).toBe("/bin/zsh");
    expect(terminalShell("win32", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" })).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  test("starts a PTY and routes output to the owning webContents", () => {
    const io = mockPty();
    const webContents = mockWebContents(7);
    const manager = createTerminalManager({
      pty: io.pty,
      cwd: "/repo",
      env: { PATH: "/bin" },
      shell: "/bin/zsh",
      randomId: () => "terminal-1",
    });

    const started = manager.start(webContents, { cols: 120, rows: 30 });

    expect(started).toEqual({
      ok: true,
      id: "terminal-1",
      pid: 42,
      shell: "/bin/zsh",
      cwd: "/repo",
      cols: 120,
      rows: 30,
    });
    expect(io.children[0].opts).toMatchObject({ cols: 120, rows: 30, cwd: "/repo" });

    io.children[0].emitData("hello");
    expect(webContents.sent).toEqual([
      { channel: "terminal:data", payload: { id: "terminal-1", data: "hello" } },
    ]);
  });

  test("returns a bridge-safe error when node-pty spawn fails", () => {
    const manager = createTerminalManager({
      pty: {
        spawn() {
          throw new Error("native spawn failed");
        },
      },
      shell: "/bin/zsh",
    });

    expect(manager.start(mockWebContents(1))).toEqual({
      ok: false,
      error: "node-pty failed to spawn /bin/zsh: native spawn failed",
    });
    expect(manager.count()).toBe(0);
  });

  test("requires webContents ownership for write, resize, and stop", () => {
    const io = mockPty();
    const owner = mockWebContents(1);
    const stranger = mockWebContents(2);
    const manager = createTerminalManager({ pty: io.pty, randomId: () => "owned" });

    manager.start(owner);

    expect(manager.write(stranger, "owned", "no")).toBe(false);
    expect(manager.write(owner, "owned", "yes")).toBe(true);
    expect(io.children[0].writes).toEqual(["yes"]);

    expect(manager.resize(stranger, "owned", { cols: 80, rows: 20 })).toBe(false);
    expect(manager.resize(owner, "owned", { cols: 80, rows: 20 })).toBe(true);
    expect(io.children[0].resizes).toEqual([{ cols: 80, rows: 20 }]);

    expect(manager.stop(stranger, "owned")).toBe(false);
    expect(manager.stop(owner, "owned")).toBe(true);
    expect(io.children[0].killed).toBe(true);
  });
});
