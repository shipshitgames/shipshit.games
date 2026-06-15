import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

// Controllable PostHog stand-in. The wrapper reads `__loaded`, `capture`, and
// `init` at call time, so flipping these between tests toggles analytics.
const posthog = {
  __loaded: false as boolean,
  capture: mock((_name: string, _props?: Record<string, string>) => {}),
  init: mock((_key: string, _config?: Record<string, unknown>) => {}),
};

mock.module("posthog-js", () => ({ default: posthog }));

// Import after the mock is registered so the module binds to our fake PostHog.
const { trackEvent, initAnalytics } = await import("./analytics");

// bun:test has no DOM; without a `window` the SSR guard would short-circuit
// every call, so give it one for the duration of this file.
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {};
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

afterEach(() => {
  posthog.__loaded = false;
  posthog.capture.mockClear();
  posthog.init.mockClear();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe("trackEvent", () => {
  test("no-ops when PostHog has not loaded", () => {
    posthog.__loaded = false;
    trackEvent("palette_open");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  test("forwards the event name and props once loaded", () => {
    posthog.__loaded = true;
    trackEvent("demo_click", { game: "scourge-survivors" });
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith("demo_click", {
      game: "scourge-survivors",
    });
  });

  test("passes undefined through when props are omitted", () => {
    posthog.__loaded = true;
    trackEvent("konami");
    expect(posthog.capture).toHaveBeenCalledWith("konami", undefined);
  });

  test("never throws when capture throws", () => {
    posthog.__loaded = true;
    posthog.capture.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => trackEvent("checkout_start")).not.toThrow();
  });

  test("no-ops during server-side rendering (no window)", () => {
    posthog.__loaded = true;
    const saved = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      trackEvent("pricing_cta_click");
      expect(posthog.capture).not.toHaveBeenCalled();
    } finally {
      (globalThis as { window?: unknown }).window = saved;
    }
  });
});

describe("initAnalytics", () => {
  test("initializes once with the documented config when a key is present", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    expect(initAnalytics()).toBe(true);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith("phc_test_key", {
      api_host: "https://us.i.posthog.com",
      capture_pageview: "history_change",
      capture_pageleave: "if_capture_pageview",
      autocapture: true,
      person_profiles: "identified_only",
    });
  });

  test("honors a custom api_host from NEXT_PUBLIC_POSTHOG_HOST", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://ph.shipshit.games";
    initAnalytics();
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({ api_host: "https://ph.shipshit.games" })
    );
  });

  test("no-ops without a key (e2e / self-hosted)", () => {
    expect(initAnalytics()).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("does not re-initialize when PostHog is already loaded", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    posthog.__loaded = true;
    expect(initAnalytics()).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("no-ops during server-side rendering (no window)", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    const saved = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(initAnalytics()).toBe(false);
      expect(posthog.init).not.toHaveBeenCalled();
    } finally {
      (globalThis as { window?: unknown }).window = saved;
    }
  });
});
