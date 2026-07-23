import { expect, test } from "bun:test";

import type { ApiAccessEventInput } from "./api-access-audit";
import { requireAuth } from "./auth";

const url = "https://api.shipshit.games/v1/assets/generate";

test("authentication failures emit boundary-specific audit events", async () => {
  const events: ApiAccessEventInput[] = [];
  const audit = async (event: ApiAccessEventInput) => {
    events.push(event);
  };

  const missing = await requireAuth(new Request(url, { method: "POST" }), {
    readSecretKey: () => "secret",
    audit,
  });
  expect(missing).toBeInstanceOf(Response);
  expect((missing as Response).status).toBe(401);

  const invalid = await requireAuth(
    new Request(url, {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
    }),
    {
      readSecretKey: () => "secret",
      verify: async () => {
        throw new Error("bad token");
      },
      audit,
    },
  );
  expect(invalid).toBeInstanceOf(Response);
  expect((invalid as Response).status).toBe(401);

  const unavailable = await requireAuth(
    new Request(url, {
      method: "POST",
      headers: { authorization: "Bearer token" },
    }),
    {
      readSecretKey: () => undefined,
      audit,
    },
  );
  expect(unavailable).toBeInstanceOf(Response);
  expect((unavailable as Response).status).toBe(503);

  expect(events).toEqual([
    {
      boundary: "authentication",
      outcome: "denied",
      reason: "missing-token",
      route: "POST /v1/assets/generate",
    },
    {
      boundary: "authentication",
      outcome: "denied",
      reason: "invalid-token",
      route: "POST /v1/assets/generate",
    },
    {
      boundary: "authentication",
      outcome: "unavailable",
      reason: "unconfigured",
      route: "POST /v1/assets/generate",
    },
  ]);
});

test("valid authentication returns the verified subject without a failure event", async () => {
  const events: ApiAccessEventInput[] = [];
  const result = await requireAuth(
    new Request(url, {
      headers: { authorization: "Bearer valid" },
    }),
    {
      readSecretKey: () => "secret",
      verify: async (_token, options) => {
        expect(options.authorizedParties).toContain(
          "https://app.shipshit.games",
        );
        return { sub: "user-1" };
      },
      audit: async (event) => {
        events.push(event);
      },
    },
  );

  expect(result).toEqual({ userId: "user-1" });
  expect(events).toEqual([]);
});
