import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

// Controllable PostHog stand-in. The wrapper reads `__loaded`, `capture`,
// `init`, and `register` at call time, so flipping these between tests toggles
// analytics.
const posthog = {
  __loaded: false as boolean,
  capture: mock((_name: string, _props?: Record<string, string>) => {}),
  init: mock((_key: string, _config?: Record<string, unknown>) => {}),
  register: mock((_props: Record<string, string>) => {}),
};

mock.module("posthog-js", () => ({ default: posthog }));

// Import after the mock is registered so the module binds to our fake PostHog.
const {
  trackEvent,
  initAnalytics,
  parseCampaignParams,
  registerCampaignContext,
} = await import("./analytics");

interface DebugWindow {
  __analyticsEvents?: { name: string; props?: Record<string, string> }[];
}

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
  posthog.register.mockClear();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  delete process.env.NEXT_PUBLIC_ANALYTICS_DEBUG;
  delete (globalThis as { window?: DebugWindow }).window?.__analyticsEvents;
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

describe("trackEvent debug mirror", () => {
  test("mirrors events to window.__analyticsEvents when the debug flag is on", () => {
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG = "1";
    posthog.__loaded = false; // mirror is independent of PostHog being live.
    trackEvent("video_click", { videoId: "abc123", location: "youtube_latest" });
    trackEvent("pricing_cta_click", { location: "home_hero" });
    const w = (globalThis as { window?: DebugWindow }).window;
    expect(w?.__analyticsEvents).toEqual([
      { name: "video_click", props: { videoId: "abc123", location: "youtube_latest" } },
      { name: "pricing_cta_click", props: { location: "home_hero" } },
    ]);
  });

  test("does not mirror when the debug flag is unset", () => {
    posthog.__loaded = false;
    trackEvent("channel_click", { location: "footer" });
    const w = (globalThis as { window?: DebugWindow }).window;
    expect(w?.__analyticsEvents).toBeUndefined();
  });

  test("mirrors even when capture later throws", () => {
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG = "1";
    posthog.__loaded = true;
    posthog.capture.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => trackEvent("checkout_start", { location: "pricing" })).not.toThrow();
    const w = (globalThis as { window?: DebugWindow }).window;
    expect(w?.__analyticsEvents).toEqual([
      { name: "checkout_start", props: { location: "pricing" } },
    ]);
  });
});

describe("parseCampaignParams", () => {
  test("extracts only the known campaign keys that are present", () => {
    const campaign = parseCampaignParams(
      "?utm_source=youtube&utm_medium=video&utm_campaign=launch&ignored=1"
    );
    expect(campaign).toEqual({
      utm_source: "youtube",
      utm_medium: "video",
      utm_campaign: "launch",
    });
  });

  test("captures utm_term, utm_content, and ref", () => {
    expect(
      parseCampaignParams("?utm_term=fps&utm_content=hero&ref=newsletter")
    ).toEqual({ utm_term: "fps", utm_content: "hero", ref: "newsletter" });
  });

  test("returns an empty object when no campaign params are present", () => {
    expect(parseCampaignParams("")).toEqual({});
    expect(parseCampaignParams("?foo=bar")).toEqual({});
  });
});

describe("registerCampaignContext", () => {
  test("registers parsed params as super properties when PostHog is live", () => {
    posthog.__loaded = true;
    expect(registerCampaignContext("?utm_source=youtube&ref=stream")).toBe(true);
    expect(posthog.register).toHaveBeenCalledTimes(1);
    expect(posthog.register).toHaveBeenCalledWith({
      utm_source: "youtube",
      ref: "stream",
    });
  });

  test("no-ops when PostHog has not loaded", () => {
    posthog.__loaded = false;
    expect(registerCampaignContext("?utm_source=youtube")).toBe(false);
    expect(posthog.register).not.toHaveBeenCalled();
  });

  test("no-ops when the URL carries no campaign params", () => {
    posthog.__loaded = true;
    expect(registerCampaignContext("?foo=bar")).toBe(false);
    expect(posthog.register).not.toHaveBeenCalled();
  });

  test("never throws when register throws", () => {
    posthog.__loaded = true;
    posthog.register.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => registerCampaignContext("?utm_source=youtube")).not.toThrow();
    expect(registerCampaignContext("?utm_source=youtube")).toBe(true);
  });
});
