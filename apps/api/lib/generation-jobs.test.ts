import { expect, test } from "bun:test";

import {
  GenerationQuotaExceededError,
  isRetryableGenerationError,
  planCreditReservation,
} from "./generation-jobs";

test("credit reservations burn included credits before purchased packs", () => {
  expect(planCreditReservation(3, 10, 5)).toEqual({
    included: 3,
    purchased: 2,
  });
  expect(planCreditReservation(8, 10, 5)).toEqual({
    included: 5,
    purchased: 0,
  });
});

test("credit reservations fail closed instead of allowing a negative balance", () => {
  expect(() => planCreditReservation(1, 2, 4)).toThrow(
    GenerationQuotaExceededError,
  );
  expect(() => planCreditReservation(1, 2, 0)).toThrow(
    "requestedCredits must be a positive integer",
  );
});

test("concurrent reservation plans cannot both fit the same serialized balance", async () => {
  let included = 1;
  let purchased = 0;
  let lock = Promise.resolve();

  const reserve = async () => {
    const previous = lock;
    let release!: () => void;
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const plan = planCreditReservation(included, purchased, 1);
      included -= plan.included;
      purchased -= plan.purchased;
      return plan;
    } finally {
      release();
    }
  };

  const results = await Promise.allSettled([reserve(), reserve()]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(included).toBe(0);
  expect(purchased).toBe(0);
});

test("retry classification distinguishes transient provider faults", () => {
  expect(
    isRetryableGenerationError(new Error("replicate 503: unavailable")),
  ).toBe(true);
  expect(
    isRetryableGenerationError(new Error("replicate 429: rate limit")),
  ).toBe(true);
  expect(isRetryableGenerationError(new Error("invalid provider input"))).toBe(
    false,
  );
  expect(
    isRetryableGenerationError(
      new TypeError("cannot read properties of undefined"),
    ),
  ).toBe(false);
});
