import { expect, test } from "bun:test";

import {
  compareBillingVersions,
  evaluateStudioPassAccess,
  hasActiveStudioPass,
  hasSkillsProContentAccess,
  hasStudioPassAccess,
  STUDIO_ASSET_ACCESS_POLICY,
  studioPassAccessState,
  type BillingEntitlements,
  type StudioPassEntitlement,
} from "./billing";

const activePass: StudioPassEntitlement = {
  productKey: "studio-pass",
  active: true,
  status: "active",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  stripeEventCreatedAt: 100,
  stripeEventRank: 20,
  stripeEventId: "evt_1",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

test("billing versions sort by Stripe timestamp and then event id", () => {
  expect(
    compareBillingVersions(
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_1" },
      { stripeEventCreatedAt: 101, stripeEventRank: 10, stripeEventId: "evt_0" },
    ),
  ).toBeLessThan(0);
  expect(
    compareBillingVersions(
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_2" },
      { stripeEventCreatedAt: 100, stripeEventRank: 20, stripeEventId: "evt_1" },
    ),
  ).toBeGreaterThan(0);
});

test("Studio Pass access requires both an active flag and active Stripe status", () => {
  expect(hasActiveStudioPass(activePass)).toBe(true);
  expect(hasActiveStudioPass({ ...activePass, active: false })).toBe(false);
  expect(hasActiveStudioPass({ ...activePass, status: "canceled" })).toBe(false);
});

test("Studio Pass decisions cover subscription, internal, missing, and inactive states", () => {
  expect(
    evaluateStudioPassAccess({
      studioPass: activePass,
      skillsProOneTime: null,
      accountExists: true,
    }),
  ).toEqual({
    allowed: true,
    reason: "active-subscription",
    status: "active",
  });
  expect(
    evaluateStudioPassAccess({
      studioPass: { ...activePass, status: "trialing" },
      skillsProOneTime: null,
    }),
  ).toMatchObject({ allowed: true, reason: "active-subscription" });
  expect(
    evaluateStudioPassAccess({
      studioPass: null,
      skillsProOneTime: null,
      studioPassInternalGrant: true,
    }),
  ).toEqual({
    allowed: true,
    reason: "internal-grant",
    status: "internal",
  });
  expect(
    evaluateStudioPassAccess({
      studioPass: null,
      skillsProOneTime: null,
      accountExists: false,
    }),
  ).toEqual({
    allowed: false,
    reason: "missing-account",
    status: null,
  });
  expect(
    evaluateStudioPassAccess({
      studioPass: { ...activePass, active: false, status: "canceled" },
      skillsProOneTime: null,
    }),
  ).toMatchObject({ allowed: false, reason: "canceled" });
  expect(
    evaluateStudioPassAccess({
      studioPass: { ...activePass, active: false, status: "past_due" },
      skillsProOneTime: null,
    }),
  ).toMatchObject({ allowed: false, reason: "inactive" });
  expect(
    hasStudioPassAccess({
      studioPass: null,
      skillsProOneTime: null,
    }),
  ).toBe(false);
});

test("asset access policy keeps reads owner-scoped while generation requires Studio Pass", () => {
  expect(STUDIO_ASSET_ACCESS_POLICY).toEqual({
    hostedGeneration: "studio-pass",
    ownedAssetRead: "authenticated-owner",
    ownedAssetExport: "authenticated-owner",
    ownedAssetTransform: "authenticated-owner",
  });
});

test("Studio Pass portal state distinguishes unclaimed, inactive, and canceled access", () => {
  expect(studioPassAccessState(null)).toBe("not-claimed");
  expect(studioPassAccessState(activePass)).toBe("active");
  expect(
    studioPassAccessState({ ...activePass, active: false, status: "past_due" }),
  ).toBe("inactive");
  expect(
    studioPassAccessState({ ...activePass, active: false, status: "canceled" }),
  ).toBe("canceled");
});

test("Skills Pro access accepts either the subscription or one-time entitlement", () => {
  const subscription: BillingEntitlements = {
    studioPass: activePass,
    skillsProOneTime: null,
  };
  const oneTime: BillingEntitlements = {
    studioPass: null,
    skillsProOneTime: {
      productKey: "games-skills-pro",
      active: true,
      source: "one-time",
      purchasedAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
      stripeEventCreatedAt: 100,
      stripeEventRank: 20,
      stripeEventId: "evt_1",
    },
  };

  expect(hasSkillsProContentAccess(subscription)).toBe(true);
  expect(hasSkillsProContentAccess(oneTime)).toBe(true);
  expect(
    hasSkillsProContentAccess({
      studioPass: null,
      skillsProOneTime: null,
      studioPassInternalGrant: true,
    }),
  ).toBe(true);
  expect(
    hasSkillsProContentAccess({
      studioPass: null,
      skillsProOneTime: { ...oneTime.skillsProOneTime!, active: false },
    }),
  ).toBe(false);
});
