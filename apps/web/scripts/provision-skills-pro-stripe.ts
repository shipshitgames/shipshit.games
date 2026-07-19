import Stripe from "stripe";
import { STUDIO_PASS } from "@shipshitgames/shared";

const FOUNDER_AMOUNT_OFF_CENTS = STUDIO_PASS.founderDiscountUsd * 100;

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
    (product) => product.metadata.product === STUDIO_PASS.productKey
  );
  if (existing) return existing;

  return stripe.products.create({
    name: `Ship Shit Games ${STUDIO_PASS.name}`,
    description: STUDIO_PASS.tagline,
    url: "https://shipshit.games/pricing",
    metadata: {
      product: STUDIO_PASS.productKey,
      site: "shipshit.games",
    },
  });
}

async function getOrCreatePrice(productId: string) {
  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [STUDIO_PASS.priceLookupKey],
    limit: 1,
  });

  const existing = prices.data.at(0);
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: STUDIO_PASS.listPriceUsd * 100,
    recurring: {
      interval: STUDIO_PASS.interval,
    },
    lookup_key: STUDIO_PASS.priceLookupKey,
    metadata: {
      product: STUDIO_PASS.productKey,
      site: "shipshit.games",
    },
  });
}

async function getOrCreateCoupon() {
  try {
    const coupon = await stripe.coupons.retrieve(STUDIO_PASS.defaultCouponId);
    if (
      "deleted" in coupon ||
      coupon.amount_off !== FOUNDER_AMOUNT_OFF_CENTS ||
      coupon.currency !== "usd"
    ) {
      throw new Error(
        `${STUDIO_PASS.defaultCouponId} must be a USD ${STUDIO_PASS.founderDiscountUsd} off coupon`
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
    id: STUDIO_PASS.defaultCouponId,
    name: "STUDIOFOUNDER20",
    amount_off: FOUNDER_AMOUNT_OFF_CENTS,
    currency: "usd",
    duration: "forever",
    metadata: {
      product: STUDIO_PASS.productKey,
      site: "shipshit.games",
    },
  });
}

const product = await getOrCreateProduct();
const price = await getOrCreatePrice(product.id);
const coupon = await getOrCreateCoupon();

console.log("Stripe Studio Pass subscription pricing is ready.");
console.log(`Product: ${product.id}`);
console.log(`STRIPE_STUDIO_PASS_PRICE_ID=${price.id}`);
console.log(`STRIPE_STUDIO_PASS_FOUNDER_COUPON_ID=${coupon.id}`);
