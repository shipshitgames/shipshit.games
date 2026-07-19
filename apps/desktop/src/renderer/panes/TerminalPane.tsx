import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

export function TerminalPane() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [status, setStatus] = useState("starting");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 5000,
      // ANSI palette mapped onto the cockpit theme tokens (theme.css).
      theme: {
        background: "#0c0d10",
        foreground: "#f4f4f5",
        cursor: "#fafafa",
        cursorAccent: "#0c0d10",
        selectionBackground: "#2a2d35",
        black: "#050607",
        red: "#ef4444",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#38bdf8",
        white: "#b4b4bc",
        brightBlack: "#6b6b78",
        brightRed: "#f87171",
        brightGreen: "#34d399",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#7dd3fc",
        brightWhite: "#f4f4f5",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitRef.current = fit;

    let resizeFrame: number | null = null;
    const fitTerminal = () => {
      try {
        fit.fit();
      } catch {}
      const id = sessionRef.current;
      if (id) {
        void window.studio?.terminal.resize(id, { cols: terminal.cols, rows: terminal.rows });
      }
    };
    const resize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        fitTerminal();
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    window.addEventListener("resize", resize);

    const input = terminal.onData((data) => {
      const id = sessionRef.current;
      if (id) void window.studio?.terminal.write(id, data);
    });
    const offData = window.studio?.terminal.onData(({ id, data }) => {
      if (id === sessionRef.current) terminal.write(data);
    });
    const offExit = window.studio?.terminal.onExit(({ id, exitCode, signal }) => {
      if (id !== sessionRef.current) return;
      setStatus(`exited ${exitCode ?? signal ?? ""}`.trim());
      terminal.writeln(`\r\n[terminal exited ${exitCode ?? signal ?? "unknown"}]`);
      sessionRef.current = null;
    });

    async function start() {
      if (!window.studio?.terminal) {
        setStatus("bridge unavailable");
        terminal.writeln("studio terminal bridge unavailable");
        return;
      }

      resize();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      fitTerminal();
      const started = await window.studio.terminal.start({ cols: terminal.cols, rows: terminal.rows });
      if (!started.ok) {
        setStatus("node-pty unavailable");
        terminal.writeln(started.error);
        return;
      }

      sessionRef.current = started.id;
      setStatus(`pid ${started.pid ?? "unknown"}`);
    }

    void start();

    return () => {
      const id = sessionRef.current;
      sessionRef.current = null;
      if (id) void window.studio?.terminal.stop(id);
      input.dispose();
      offData?.();
      offExit?.();
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return (
    <section className="terminal" aria-label="Terminal">
      <div className="terminal-bar">
        <span className="terminal-dot" />
        <span className="terminal-title">terminal</span>
        <span className="terminal-hint">{status}</span>
      </div>
      <div className="terminal-body">
        <div ref={mountRef} className="terminal-mount" />
      </div>
    </section>
  );
}
