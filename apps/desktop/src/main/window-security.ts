// Ship Shit Games — Studio shell (Electron main): window navigation hardening.
//
// The preload exposes window.studio.terminal.start()/write(), which pipe renderer
// strings straight into a real login shell — RCE-grade IPC. That bridge is bound to
// the window's webContents, so it survives any in-window navigation regardless of
// where the page ends up. If a stray <a target="_blank">, an injected redirect, or a
// window.open() could steer the renderer onto attacker-controlled web content, that
// content would inherit the terminal bridge. So we pin the renderer to its own origin:
//   - will-navigate / will-frame-navigate / will-redirect: allow only same-origin
//     (dev) or in-bundle file:// (packaged) navigations; preventDefault() everything
//     else.
//   - will-attach-webview: reject every guest renderer before it is created.
//   - setWindowOpenHandler: deny every popup; http(s) links are handed to the OS
//     browser via shell.openExternal, all other schemes are dropped.
//
// The decision functions are pure so they can be unit-tested without an Electron
// runtime (index.ts itself can't be imported under `bun test`).

export type NavigationDecision = "allow" | "block";
export type WindowOpenDecision = "external" | "deny";

/**
 * Decide whether an in-window navigation to `targetUrl` should be allowed, given the
 * URL the renderer was originally loaded from (`allowedUrl`: the dev server URL in dev,
 * the packaged `file://…/index.html` in prod).
 *
 * http/https app origins (the Vite dev server) → same-origin only.
 * file:// app (packaged renderer)             → only file:// targets inside the app dir.
 * Anything else (unparseable, other schemes)  → blocked.
 */
export function decideNavigation(targetUrl: string, allowedUrl: string): NavigationDecision {
  let target: URL;
  let allowed: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return "block";
  }
  try {
    allowed = new URL(allowedUrl);
  } catch {
    return "block";
  }

  if (allowed.protocol === "http:" || allowed.protocol === "https:") {
    return target.origin === allowed.origin ? "allow" : "block";
  }

  if (allowed.protocol === "file:") {
    if (target.protocol !== "file:") return "block";
    // Confine to the directory that holds index.html so a crafted file:// target
    // can't traverse to other local files (e.g. file:///etc/passwd).
    const appDir = decodeAppPath(allowed.pathname).replace(/\/[^/]*$/, "/");
    const targetPath = decodeAppPath(target.pathname);
    return targetPath.startsWith(appDir) ? "allow" : "block";
  }

  return "block";
}

// Decode percent escapes and normalize `..`/`.` segments so differently encoded paths
// compare consistently and encoded traversal cannot sneak past the prefix check.
function decodeAppPath(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* keep raw on malformed escapes */
  }
  const segments: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return "/" + segments.join("/") + (decoded.endsWith("/") ? "/" : "");
}

/**
 * Decide what to do with a window.open()/target=_blank request. We never let the app
 * spawn its own Electron windows (they'd carry the preload); http(s) links go to the
 * user's real browser, everything else is dropped.
 */
export function decideWindowOpen(targetUrl: string): WindowOpenDecision {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return "deny";
  }
  return url.protocol === "http:" || url.protocol === "https:" ? "external" : "deny";
}

// Minimal structural shapes so this module never imports electron (which would break
// `bun test`). At runtime the real webContents / shell satisfy these.
interface NavigationEvent {
  preventDefault(): void;
}
interface FrameNavigationEvent extends NavigationEvent {
  url: string;
}
interface HardenableWebContents {
  on(
    event: "will-navigate" | "will-redirect",
    listener: (event: NavigationEvent, url: string) => void,
  ): unknown;
  on(event: "will-frame-navigate", listener: (event: FrameNavigationEvent) => void): unknown;
  on(event: "will-attach-webview", listener: (event: NavigationEvent) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): unknown;
}
interface ExternalShell {
  openExternal(url: string): unknown;
}

/**
 * Attach the navigation + window-open guards to a window's webContents. Pure wiring —
 * all Electron objects are injected, so this is exercised in unit tests with fakes.
 */
export function hardenWindow(
  contents: HardenableWebContents,
  allowedUrl: string,
  shell: ExternalShell,
): void {
  const guardNavigation = (event: { preventDefault(): void }, url: string) => {
    if (decideNavigation(url, allowedUrl) === "block") {
      event.preventDefault();
    }
  };
  contents.on("will-navigate", guardNavigation);
  contents.on("will-frame-navigate", (event) => guardNavigation(event, event.url));
  contents.on("will-redirect", guardNavigation);
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (decideWindowOpen(url) === "external") {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}
