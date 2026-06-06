import Stripe from "stripe";

import { SKILLS_PRO } from "../lib/skills-pro";

const PRICE_LOOKUP_KEY = "shipshit-skills-pro-49-usd";
const EARLY_BUYER_AMOUNT_OFF_CENTS = SKILLS_PRO.earlyBuyerDiscountUsd * 100;

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error("Set STRIPE_SECRET_KEY to provision Stripe pricing.");
}

const stripe = new Stripe(key);

async function getOrCreateProduct() {
  const products = await stripe.products.list({
    active: true,
    limit: 100,
  });

  const existing = products.data.find(
    (product) => product.metadata.product === "skills-pro"
  );
  if (existing) return existing;

  return stripe.products.create({
    name: "Ship Shit Games Skills Pro",
    description: SKILLS_PRO.tagline,
    url: "https://shipshit.games/pricing",
    metadata: {
      product: "skills-pro",
      site: "shipshit.games",
    },
  });
}

async function getOrCreatePrice(productId: string) {
  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [PRICE_LOOKUP_KEY],
    limit: 1,
  });

  const existing = prices.data.at(0);
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: SKILLS_PRO.listPriceUsd * 100,
    lookup_key: PRICE_LOOKUP_KEY,
    metadata: {
      product: "skills-pro",
      site: "shipshit.games",
    },
  });
}

async function getOrCreateCoupon() {
  try {
    const coupon = await stripe.coupons.retrieve(SKILLS_PRO.defaultCouponId);
    if (
      "deleted" in coupon ||
      coupon.amount_off !== EARLY_BUYER_AMOUNT_OFF_CENTS ||
      coupon.currency !== "usd"
    ) {
      throw new Error(
        `${SKILLS_PRO.defaultCouponId} must be a USD ${SKILLS_PRO.earlyBuyerDiscountUsd} off coupon`
      );
    }
    return coupon;
  } catch (error) {
    const stripeError = error as { code?: string };
    if (stripeError.code !== "resource_missing") {
      throw error;
    }
  }

  return stripe.coupons.create({
    id: SKILLS_PRO.defaultCouponId,
    name: "EARLYFOUNDER20",
    amount_off: EARLY_BUYER_AMOUNT_OFF_CENTS,
    currency: "usd",
    duration: "once",
    metadata: {
      product: "skills-pro",
      site: "shipshit.games",
    },
  });
}

const product = await getOrCreateProduct();
const price = await getOrCreatePrice(product.id);
const coupon = await getOrCreateCoupon();

console.log("Stripe Skills Pro pricing is ready.");
console.log(`Product: ${product.id}`);
console.log(`STRIPE_SKILLS_PRO_PRICE_ID=${price.id}`);
console.log(`STRIPE_SKILLS_PRO_EARLY_COUPON_ID=${coupon.id}`);
