import { describe, expect, test } from "bun:test";

import { ACCENT_HEX, accentStyle, accentVar, pageAccent } from "./accent";

describe("accentVar", () => {
  test("maps a token to its theme.css CSS var", () => {
    expect(accentVar("hellfire")).toBe("var(--color-hellfire)");
    expect(accentVar("blood")).toBe("var(--color-blood)");
    expect(accentVar("rust")).toBe("var(--color-rust)");
  });
});

describe("pageAccent", () => {
  test("sets only --page-accent, never --accent", () => {
    const style = pageAccent("hellfire") as Record<string, string>;
    expect(style["--page-accent"]).toBe("var(--color-hellfire)");
    expect("--accent" in style).toBe(false);
  });

  test("differs from accentStyle, which sets both vars", () => {
    const both = accentStyle("blood") as Record<string, string>;
    expect(both["--accent"]).toBe("var(--color-blood)");
    expect(both["--page-accent"]).toBe("var(--color-blood)");
  });

  test("covers every accent token used by the marketing pages", () => {
    for (const token of ["hellfire", "blood", "rust"] as const) {
      const style = pageAccent(token) as Record<string, string>;
      expect(style["--page-accent"]).toBe(`var(--color-${token})`);
      // The CSS var resolves to the hex the old local helpers hard-coded.
      expect(ACCENT_HEX[token]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
