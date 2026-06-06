export const SKILLS_PRO = {
  name: "Skills Pro",
  tagline: "Build games with the same agent skills we use.",
  listPriceUsd: 49,
  earlyBuyerDiscountUsd: 20,
  defaultCouponId: "shipshit-skills-pro-early-20-off",
  priceEnvKey: "STRIPE_SKILLS_PRO_PRICE_ID",
  couponEnvKey: "STRIPE_SKILLS_PRO_EARLY_COUPON_ID",
} as const;

export const SKILLS_PRO_EARLY_PRICE_USD =
  SKILLS_PRO.listPriceUsd - SKILLS_PRO.earlyBuyerDiscountUsd;

export const SKILLS_PRO_FEATURES = [
  "AI game production skills for planning, scaffolding, review, polish, and deployment.",
  "The practical build loop behind our browser games: prompts, checks, asset flow, and shipping cadence.",
  "Updates as the studio hardens new workflows from live Ship Shit Show builds.",
] as const;

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
