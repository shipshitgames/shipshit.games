import { afterEach, beforeEach, expect, test } from "bun:test";
import { STUDIO_PASS } from "@shipshitgames/shared";
import type Stripe from "stripe";

import { founderCouponId, studioPassPriceId } from "./studio-pass";

const FOUNDER_AMOUNT_OFF_CENTS = STUDIO_PASS.founderDiscountUsd * 100;

const priceKey = STUDIO_PASS.priceEnvKey;
const couponKey = STUDIO_PASS.couponEnvKey;
const originalPrice = process.env[priceKey];
const originalCoupon = process.env[couponKey];

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  delete process.env[priceKey];
  delete process.env[couponKey];
});

afterEach(() => {
  restore(priceKey, originalPrice);
  restore(couponKey, originalCoupon);
});

// Minimal Stripe stub whose only surface is coupons.retrieve. Records the id it
// was asked for so we can assert env-key resolution.
function fakeStripe(coupon: unknown) {
  const calls: string[] = [];
  const stripe = {
    coupons: {
      retrieve: async (id: string) => {
        calls.push(id);
        return coupon;
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const validCoupon = {
  id: "STUDIOFOUNDER20",
  amount_off: FOUNDER_AMOUNT_OFF_CENTS,
  currency: "usd",
};

test("studioPassPriceId returns the configured price id", () => {
  process.env[priceKey] = "price_live_studio";
  expect(studioPassPriceId()).toBe("price_live_studio");
});

test("studioPassPriceId throws when the price env var is missing", () => {
  expect(() => studioPassPriceId()).toThrow(`Missing ${priceKey}`);
});

test("founderCouponId accepts a matching USD founder coupon", async () => {
  const { stripe, calls } = fakeStripe(validCoupon);
  expect(await founderCouponId(stripe)).toBe(STUDIO_PASS.defaultCouponId);
  // Falls back to the shared default coupon id when the env var is unset.
  expect(calls).toEqual([STUDIO_PASS.defaultCouponId]);
});

test("founderCouponId prefers the env-overridden coupon id", async () => {
  process.env[couponKey] = "STRIPE_OVERRIDE_COUPON";
  const { stripe, calls } = fakeStripe({
    ...validCoupon,
    id: "STRIPE_OVERRIDE_COUPON",
  });
  expect(await founderCouponId(stripe)).toBe("STRIPE_OVERRIDE_COUPON");
  expect(calls).toEqual(["STRIPE_OVERRIDE_COUPON"]);
});

test("founderCouponId rejects a deleted coupon", async () => {
  const { stripe } = fakeStripe({ id: "STUDIOFOUNDER20", deleted: true });
  await expect(founderCouponId(stripe)).rejects.toThrow(
    "must be a USD 20 off coupon"
  );
});

test("founderCouponId rejects a coupon with the wrong amount", async () => {
  const { stripe } = fakeStripe({ ...validCoupon, amount_off: 500 });
  await expect(founderCouponId(stripe)).rejects.toThrow(
    "must be a USD 20 off coupon"
  );
});

test("founderCouponId rejects a coupon in the wrong currency", async () => {
  const { stripe } = fakeStripe({ ...validCoupon, currency: "eur" });
  await expect(founderCouponId(stripe)).rejects.toThrow(
    "must be a USD 20 off coupon"
  );
});
