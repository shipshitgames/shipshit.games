import { afterEach, beforeEach, expect, test } from "bun:test";

import { createAccessToken, verifyAccessToken } from "./access-token";

const SECRET = "test-access-signing-secret";
const originalSecret = process.env.ACCESS_SIGNING_SECRET;
const originalClerk = process.env.CLERK_SECRET_KEY;

beforeEach(() => {
  process.env.ACCESS_SIGNING_SECRET = SECRET;
  delete process.env.CLERK_SECRET_KEY;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ACCESS_SIGNING_SECRET;
  else process.env.ACCESS_SIGNING_SECRET = originalSecret;
  if (originalClerk === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalClerk;
});

const input = {
  sub: "user_123",
  email: "buyer@example.com",
  resource: "skills-pro" as const,
};

test("verify accepts a freshly signed token and returns the payload", () => {
  const token = createAccessToken(input);
  const payload = verifyAccessToken(token);

  expect(payload.sub).toBe(input.sub);
  expect(payload.email).toBe(input.email);
  expect(payload.resource).toBe("skills-pro");
  expect(payload.exp).toBeGreaterThan(payload.iat);
  expect(typeof payload.nonce).toBe("string");
  expect(payload.nonce.length).toBeGreaterThan(0);
});

test("verify rejects a token whose signature byte was tampered", () => {
  const token = createAccessToken(input);
  const [encodedPayload, signature] = token.split(".");
  // Flip one base64url character but keep the length identical so the guard
  // falls through to timingSafeEqual rather than the length short-circuit.
  const flipped = signature[0] === "A" ? "B" : "A";
  const tampered = `${encodedPayload}.${flipped}${signature.slice(1)}`;

  expect(() => verifyAccessToken(tampered)).toThrow("Invalid access token signature");
});

test("verify rejects a payload swapped under a captured signature", () => {
  const token = createAccessToken(input);
  const signature = token.split(".")[1];
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...input, iat: 0, exp: 9999999999, nonce: "forged" })
  ).toString("base64url");

  expect(() => verifyAccessToken(`${forgedPayload}.${signature}`)).toThrow(
    "Invalid access token signature"
  );
});

test("verify rejects a signature produced under a different secret", () => {
  process.env.ACCESS_SIGNING_SECRET = "attacker-secret";
  const token = createAccessToken(input);
  process.env.ACCESS_SIGNING_SECRET = SECRET;

  expect(() => verifyAccessToken(token)).toThrow("Invalid access token signature");
});

test("verify rejects an expired token", () => {
  const token = createAccessToken(input, -10);

  expect(() => verifyAccessToken(token)).toThrow("Expired access token");
});

test("verify rejects a malformed token with no signature segment", () => {
  expect(() => verifyAccessToken("only-one-segment")).toThrow("Malformed access token");
});

test("verify rejects an empty token", () => {
  expect(() => verifyAccessToken("")).toThrow("Malformed access token");
});

test("createAccessToken falls back to CLERK_SECRET_KEY when signing secret is unset", () => {
  delete process.env.ACCESS_SIGNING_SECRET;
  process.env.CLERK_SECRET_KEY = "clerk-fallback-secret";

  const token = createAccessToken(input);
  expect(verifyAccessToken(token).sub).toBe(input.sub);
});

test("createAccessToken throws when no signing secret is configured", () => {
  delete process.env.ACCESS_SIGNING_SECRET;
  delete process.env.CLERK_SECRET_KEY;

  expect(() => createAccessToken(input)).toThrow("Missing ACCESS_SIGNING_SECRET");
});
