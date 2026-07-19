// Guards for the Electron window navigation hardening (2026-07-12 security audit).
// The renderer carries an RCE-grade terminal bridge, so it must never be steerable
// onto foreign web content: same-origin/in-bundle navigation only, and no popups.
import { expect, test, describe } from "bun:test";
import { decideNavigation, decideWindowOpen, hardenWindow } from "./window-security";

describe("decideNavigation — dev server (http origin)", () => {
  const dev = "http://localhost:5273/";

  test("allows same-origin navigations", () => {
    expect(decideNavigation("http://localhost:5273/", dev)).toBe("allow");
    expect(decideNavigation("http://localhost:5273/sprites", dev)).toBe("allow");
    expect(decideNavigation("http://localhost:5273/#/settings", dev)).toBe("allow");
  });

  test("blocks foreign origins, schemes, and ports", () => {
    expect(decideNavigation("https://evil.example/steal", dev)).toBe("block");
    expect(decideNavigation("http://localhost:9999/", dev)).toBe("block");
    expect(decideNavigation("http://evil.localhost:5273/", dev)).toBe("block");
    expect(decideNavigation("file:///etc/passwd", dev)).toBe("block");
    expect(decideNavigation("javascript:alert(1)", dev)).toBe("block");
    expect(decideNavigation("not a url", dev)).toBe("block");
  });
});

describe("decideNavigation — packaged renderer (file:// bundle)", () => {
  const bundle = "file:///Applications/Studio.app/Contents/dist/index.html";

  test("allows file:// targets inside the app directory", () => {
    expect(decideNavigation("file:///Applications/Studio.app/Contents/dist/index.html", bundle)).toBe("allow");
    expect(decideNavigation("file:///Applications/Studio.app/Contents/dist/assets/app.js", bundle)).toBe("allow");
  });

  test("allows encoded targets when the app install path contains spaces or non-ASCII characters", () => {
    const spacedBundle = "file:///Applications/Ship%20Shit%20Games/Studio.app/Contents/dist/index.html";
    expect(
      decideNavigation(
        "file:///Applications/Ship%20Shit%20Games/Studio.app/Contents/dist/assets/app.js",
        spacedBundle,
      ),
    ).toBe("allow");

    const unicodeBundle = "file:///Applications/Stud%C3%ADo.app/Contents/dist/index.html";
    expect(
      decideNavigation(
        "file:///Applications/Stud%C3%ADo.app/Contents/dist/assets/app.js",
        unicodeBundle,
      ),
    ).toBe("allow");
  });

  test("blocks traversal out of the bundle and non-file schemes", () => {
    expect(decideNavigation("file:///etc/passwd", bundle)).toBe("block");
    expect(decideNavigation("file:///Applications/Studio.app/Contents/dist/../secrets.txt", bundle)).toBe("block");
    expect(decideNavigation("file:///Applications/Studio.app/Contents/dist/../../other/index.html", bundle)).toBe("block");
    expect(decideNavigation("https://evil.example/", bundle)).toBe("block");
  });
});

describe("decideWindowOpen", () => {
  test("routes http(s) links to the external browser", () => {
    expect(decideWindowOpen("https://shipshit.games/docs")).toBe("external");
    expect(decideWindowOpen("http://example.com")).toBe("external");
  });

  test("denies every other scheme and junk", () => {
    expect(decideWindowOpen("file:///etc/passwd")).toBe("deny");
    expect(decideWindowOpen("javascript:alert(1)")).toBe("deny");
    expect(decideWindowOpen("mailto:a@b.c")).toBe("deny");
    expect(decideWindowOpen("about:blank")).toBe("deny");
    expect(decideWindowOpen("garbage")).toBe("deny");
  });
});

describe("hardenWindow wiring", () => {
  function fakeContents() {
    const handlers: Record<
      string,
      (event: { preventDefault(): void; url?: string }, url?: string) => void
    > = {};
    let windowOpenHandler: ((d: { url: string }) => { action: string }) | null = null;
    return {
      handlers,
      openHandler: () => windowOpenHandler,
      on(
        event: string,
        listener: (event: { preventDefault(): void; url?: string }, url?: string) => void,
      ) {
        handlers[event] = listener;
      },
      setWindowOpenHandler(handler: (d: { url: string }) => { action: string }) {
        windowOpenHandler = handler;
      },
    };
  }

  test("preventDefaults foreign navigation on both will-navigate and will-redirect", () => {
    const contents = fakeContents();
    hardenWindow(contents as never, "http://localhost:5273/", { openExternal: () => {} });

    for (const event of ["will-navigate", "will-redirect"] as const) {
      let prevented = false;
      contents.handlers[event]({ preventDefault: () => { prevented = true; } }, "https://evil.example/");
      expect(prevented).toBe(true);

      prevented = false;
      contents.handlers[event]({ preventDefault: () => { prevented = true; } }, "http://localhost:5273/sprites");
      expect(prevented).toBe(false);
    }
  });

  test("prevents foreign frame navigation while allowing same-origin frames", () => {
    const contents = fakeContents();
    hardenWindow(contents as never, "http://localhost:5273/", { openExternal: () => {} });

    let prevented = false;
    contents.handlers["will-frame-navigate"]({
      preventDefault: () => {
        prevented = true;
      },
      url: "https://evil.example/frame",
    });
    expect(prevented).toBe(true);

    prevented = false;
    contents.handlers["will-frame-navigate"]({
      preventDefault: () => {
        prevented = true;
      },
      url: "http://localhost:5273/frame",
    });
    expect(prevented).toBe(false);
  });

  test("rejects webviews before guest contents are attached", () => {
    const contents = fakeContents();
    hardenWindow(contents as never, "http://localhost:5273/", { openExternal: () => {} });

    let prevented = false;
    contents.handlers["will-attach-webview"]({
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
  });

  test("denies all popups and forwards only http(s) to shell.openExternal", () => {
    const opened: string[] = [];
    const contents = fakeContents();
    hardenWindow(contents as never, "http://localhost:5273/", { openExternal: (u: string) => opened.push(u) });

    const handler = contents.openHandler()!;
    expect(handler({ url: "https://shipshit.games/docs" })).toEqual({ action: "deny" });
    expect(handler({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://shipshit.games/docs"]);
  });
});
