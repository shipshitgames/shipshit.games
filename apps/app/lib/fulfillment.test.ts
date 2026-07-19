import { afterEach, beforeEach, expect, test } from "bun:test";
import { SKILLS_PRO_ONETIME, STUDIO_PASS } from "@shipshitgames/shared";

import { verifyAccessToken } from "./access-token";
import {
  createClaimUrl,
  createSkillsProAccessUrl,
  runFulfillment,
  runSkillsProOneTimeFulfillment,
} from "./fulfillment";

// Env vars this module and its collaborators read.
const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "ACCESS_SIGNING_SECRET",
  "CLERK_SECRET_KEY",
  "FULFILLMENT_WEBHOOK_URL",
  "SKOOL_INVITE_WEBHOOK_URL",
  "SKOOL_FULFILLMENT_ENABLED",
  "RESEND_API_KEY",
  "ACCESS_EMAIL_FROM",
] as const;

const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

type FetchCall = { url: string; body: unknown };
let calls: FetchCall[] = [];

function stubFetch(responder: (url: string) => { ok: boolean; status: number }) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    const { ok, status } = responder(url);
    return { ok, status } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NEXT_PUBLIC_APP_URL = "https://app.shipshit.games";
  process.env.ACCESS_SIGNING_SECRET = "test-secret";
  calls = [];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  globalThis.fetch = realFetch;
});

// --- URL builders -----------------------------------------------------------

test("createClaimUrl points at the app /claim route with the session id", () => {
  const url = new URL(createClaimUrl("cs_test_123"));
  expect(url.origin).toBe("https://app.shipshit.games");
  expect(url.pathname).toBe("/claim");
  expect(url.searchParams.get("session_id")).toBe("cs_test_123");
});

test("createSkillsProAccessUrl embeds a verifiable skills-pro token", () => {
  const url = new URL(createSkillsProAccessUrl("user_1", "buyer@example.com"));
  expect(url.pathname).toBe("/api/access/skills-pro");
  const token = url.searchParams.get("token");
  expect(token).not.toBeNull();
  const payload = verifyAccessToken(token!);
  expect(payload.sub).toBe("user_1");
  expect(payload.email).toBe("buyer@example.com");
  expect(payload.resource).toBe("skills-pro");
});

// --- runFulfillment ---------------------------------------------------------

const studioInput = {
  userId: "user_1",
  email: "buyer@example.com",
  name: "Buyer",
  checkoutSessionId: "cs_1",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
};

test("runFulfillment sends nothing when no channels are configured", async () => {
  const result = await runFulfillment(studioInput);
  expect(result).toEqual({ skoolInviteSent: false, accessEmailSent: false });
  expect(calls).toHaveLength(0);
});

test("runFulfillment posts the studio-pass webhook and reports the email sent", async () => {
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  stubFetch(() => ({ ok: true, status: 200 }));

  const result = await runFulfillment(studioInput);

  expect(result.accessEmailSent).toBe(true);
  expect(result.skoolInviteSent).toBe(false);
  expect(result.error).toBeUndefined();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://hooks.example.com/fulfill");
  const body = calls[0].body as Record<string, unknown>;
  expect(body.product).toBe(STUDIO_PASS.productKey);
  expect(body.email).toBe("buyer@example.com");
  expect(String(body.claimUrl)).toContain("session_id=cs_1");
  expect(String(body.skillsProAccessUrl)).toContain("/api/access/skills-pro");
});

test("runFulfillment sends the skool invite when the flag and webhook are set", async () => {
  process.env.SKOOL_FULFILLMENT_ENABLED = "true";
  process.env.SKOOL_INVITE_WEBHOOK_URL = "https://hooks.example.com/skool";
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  stubFetch(() => ({ ok: true, status: 200 }));

  const result = await runFulfillment(studioInput);

  expect(result.skoolInviteSent).toBe(true);
  expect(result.accessEmailSent).toBe(true);
  expect(calls.map((c) => c.url)).toEqual([
    "https://hooks.example.com/skool",
    "https://hooks.example.com/fulfill",
  ]);
});

test("runFulfillment captures the error when a webhook responds non-ok", async () => {
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  stubFetch(() => ({ ok: false, status: 500 }));

  const result = await runFulfillment(studioInput);

  expect(result.accessEmailSent).toBe(false);
  expect(result.error).toContain("500");
});

test("runFulfillment falls back to Resend when no webhook is configured", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.ACCESS_EMAIL_FROM = "studio@shipshit.games";
  stubFetch(() => ({ ok: true, status: 200 }));

  const result = await runFulfillment(studioInput);

  expect(result.accessEmailSent).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://api.resend.com/emails");
  const body = calls[0].body as Record<string, unknown>;
  expect(body.to).toBe("buyer@example.com");
});

// --- runSkillsProOneTimeFulfillment -----------------------------------------

const oneTimeInput = {
  userId: "user_2",
  email: "gamer@example.com",
  name: "Gamer",
  checkoutSessionId: "cs_2",
  stripeCustomerId: "cus_2",
};

test("runSkillsProOneTimeFulfillment posts the one-time webhook with an access url", async () => {
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  stubFetch(() => ({ ok: true, status: 200 }));

  const result = await runSkillsProOneTimeFulfillment(oneTimeInput);

  expect(result.accessEmailSent).toBe(true);
  expect(result.error).toBeUndefined();
  const body = calls[0].body as Record<string, unknown>;
  expect(body.product).toBe(SKILLS_PRO_ONETIME.productKey);
  expect(String(body.skillsProAccessUrl)).toContain("/api/access/skills-pro");
});

test("runSkillsProOneTimeFulfillment returns false when no channels are configured", async () => {
  const result = await runSkillsProOneTimeFulfillment(oneTimeInput);
  expect(result).toEqual({ accessEmailSent: false });
  expect(calls).toHaveLength(0);
});

test("runSkillsProOneTimeFulfillment captures a Resend failure as an error", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.ACCESS_EMAIL_FROM = "studio@shipshit.games";
  stubFetch(() => ({ ok: false, status: 422 }));

  const result = await runSkillsProOneTimeFulfillment(oneTimeInput);

  expect(result.accessEmailSent).toBe(false);
  expect(result.error).toContain("422");
});
