import { afterEach, beforeEach, expect, test } from "bun:test";

import { verifyAccessToken } from "./access-token";
import { createSkillsProAccessUrl } from "./fulfillment";

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "ACCESS_SIGNING_SECRET",
  "CLERK_SECRET_KEY",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NEXT_PUBLIC_APP_URL = "https://app.shipshit.games";
  process.env.ACCESS_SIGNING_SECRET = "test-secret";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
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
