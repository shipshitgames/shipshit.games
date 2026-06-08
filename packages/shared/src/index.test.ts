import { expect, test } from "bun:test";

import {
  GAMES,
  GAME_SLUGS,
  STATUS_LABELS,
  STUDIO_PASS,
  STUDIO_PASS_FEATURES,
  formatUsd,
  isActiveSubscriptionStatus,
} from "./index";

test("every canonical art-target slug exists in the games catalogue", () => {
  for (const slug of GAME_SLUGS) {
    expect(GAMES.some((g) => g.slug === slug)).toBe(true);
  }
});

test("GAME_SLUGS is the six art-target slugs, deduped, without the gallery-only warline hub", () => {
  expect(GAME_SLUGS.length).toBe(6);
  expect(new Set(GAME_SLUGS).size).toBe(6);
  expect(GAME_SLUGS).not.toContain("warline");
});

test("every game carries a status label and the required gallery fields", () => {
  const stringFields = [
    "slug",
    "title",
    "blurb",
    "faction",
    "genre",
    "courseAngle",
    "summary",
    "coverPath",
    "deadrotUrl",
    "readinessIssueUrl",
    "repoUrl",
  ] as const;
  for (const game of GAMES) {
    expect(typeof STATUS_LABELS[game.status]).toBe("string");
    for (const field of stringFields) {
      expect(typeof game[field]).toBe("string");
      expect((game[field] as string).length).toBeGreaterThan(0);
    }
    expect(Array.isArray(game.proofPoints)).toBe(true);
    expect(game.proofPoints.length).toBeGreaterThan(0);
  }
});

test("game slugs are unique across the catalogue", () => {
  const slugs = GAMES.map((g) => g.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
});

test("isActiveSubscriptionStatus only accepts active and trialing", () => {
  expect(isActiveSubscriptionStatus("active")).toBe(true);
  expect(isActiveSubscriptionStatus("trialing")).toBe(true);
  expect(isActiveSubscriptionStatus("canceled")).toBe(false);
  expect(isActiveSubscriptionStatus("")).toBe(false);
  expect(isActiveSubscriptionStatus(null)).toBe(false);
  expect(isActiveSubscriptionStatus(undefined)).toBe(false);
});

test("formatUsd renders whole and fractional dollars", () => {
  expect(formatUsd(49)).toBe("$49");
  expect(formatUsd(29)).toBe("$29");
  expect(formatUsd(9.5)).toBe("$9.50");
});

test("STUDIO_PASS founder pricing is internally consistent", () => {
  expect(STUDIO_PASS.listPriceUsd - STUDIO_PASS.founderDiscountUsd).toBe(STUDIO_PASS.founderPriceUsd);
  expect(STUDIO_PASS_FEATURES.length).toBeGreaterThan(0);
});
