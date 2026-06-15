import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

// Controllable PostHog stand-in. The flag helpers read `__loaded` and the flag
// methods at call time, so mutating these between tests drives every branch.
const posthog = {
  __loaded: false as boolean,
  isFeatureEnabled: mock((_flag: string): boolean | undefined => undefined),
  getFeatureFlag: mock(
    (_flag: string): boolean | string | undefined => undefined
  ),
};

mock.module("posthog-js", () => ({ default: posthog }));

// Import after the mock is registered so the module binds to our fake PostHog.
const { isFeatureEnabled, getFeatureFlag } = await import("./flags");

// bun:test has no DOM; `analyticsReady()` requires a `window`, so provide one.
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {};
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

afterEach(() => {
  posthog.__loaded = false;
  posthog.isFeatureEnabled.mockClear();
  posthog.getFeatureFlag.mockClear();
});

describe("isFeatureEnabled", () => {
  test("returns the default fallback (false) when PostHog is unavailable", () => {
    posthog.__loaded = false;
    expect(isFeatureEnabled("studio-pass-promo")).toBe(false);
    expect(posthog.isFeatureEnabled).not.toHaveBeenCalled();
  });

  test("honors an explicit fallback when PostHog is unavailable", () => {
    posthog.__loaded = false;
    expect(isFeatureEnabled("studio-pass-promo", true)).toBe(true);
  });

  test("delegates to PostHog when loaded", () => {
    posthog.__loaded = true;
    posthog.isFeatureEnabled.mockReturnValueOnce(true);
    expect(isFeatureEnabled("studio-pass-promo")).toBe(true);
    expect(posthog.isFeatureEnabled).toHaveBeenCalledWith("studio-pass-promo");
  });

  test("falls back when PostHog reports the flag as undefined", () => {
    posthog.__loaded = true;
    posthog.isFeatureEnabled.mockReturnValueOnce(undefined);
    expect(isFeatureEnabled("studio-pass-promo", true)).toBe(true);
  });

  test("never throws — returns the fallback if PostHog throws", () => {
    posthog.__loaded = true;
    posthog.isFeatureEnabled.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(isFeatureEnabled("studio-pass-promo", false)).toBe(false);
  });

  test("fails closed to the fallback during SSR (no window)", () => {
    posthog.__loaded = true;
    const saved = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(isFeatureEnabled("studio-pass-promo", false)).toBe(false);
      expect(posthog.isFeatureEnabled).not.toHaveBeenCalled();
    } finally {
      (globalThis as { window?: unknown }).window = saved;
    }
  });
});

describe("getFeatureFlag", () => {
  test("returns the default fallback (undefined) when unavailable", () => {
    posthog.__loaded = false;
    expect(getFeatureFlag("studio-pass-promo")).toBeUndefined();
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled();
  });

  test("returns a multivariate variant string when loaded", () => {
    posthog.__loaded = true;
    posthog.getFeatureFlag.mockReturnValueOnce("variant-a");
    expect(getFeatureFlag("studio-pass-promo")).toBe("variant-a");
  });

  test("falls back when PostHog reports the flag as undefined", () => {
    posthog.__loaded = true;
    posthog.getFeatureFlag.mockReturnValueOnce(undefined);
    expect(getFeatureFlag("studio-pass-promo", "control")).toBe("control");
  });

  test("never throws — returns the fallback if PostHog throws", () => {
    posthog.__loaded = true;
    posthog.getFeatureFlag.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(getFeatureFlag("studio-pass-promo", "control")).toBe("control");
  });
});
