import {
  formatUsd,
  STUDIO_PASS,
  STUDIO_PASS_FEATURES,
} from "@shipshitgames/shared";

export const SKILLS_PRO = {
  name: STUDIO_PASS.name,
  tagline: STUDIO_PASS.tagline,
  listPriceUsd: STUDIO_PASS.listPriceUsd,
  earlyBuyerDiscountUsd: STUDIO_PASS.founderDiscountUsd,
  defaultCouponId: STUDIO_PASS.defaultCouponId,
  priceEnvKey: STUDIO_PASS.priceEnvKey,
  couponEnvKey: STUDIO_PASS.couponEnvKey,
  interval: STUDIO_PASS.interval,
} as const;

export const SKILLS_PRO_EARLY_PRICE_USD =
  STUDIO_PASS.founderPriceUsd;

export const SKILLS_PRO_FEATURES = STUDIO_PASS_FEATURES;
export { formatUsd };
