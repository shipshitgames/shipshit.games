import { expect, test } from "bun:test";

import {
  listContentAccessEvents,
  parseContentAccessEvent,
  recordContentAccessEvent,
  type ContentAccessStore,
} from "./content-access";

function store(): ContentAccessStore & { limits: number[] } {
  const limits: number[] = [];
  return {
    limits,
    async create(userId, input) {
      return {
        id: `event-${userId}`,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        outcome: input.outcome,
        createdAt: new Date("2026-07-22T00:00:00.000Z"),
      };
    },
    async list(_userId, limit) {
      limits.push(limit);
      return [];
    },
  };
}

test("member asset events require a safe pack id", () => {
  expect(
    parseContentAccessEvent({
      resource: "member-asset-pack",
      resourceId: "july-sprite-drop",
      outcome: "granted",
    }),
  ).toEqual({
    resource: "member-asset-pack",
    resourceId: "july-sprite-drop",
    outcome: "granted",
  });
  expect(() =>
    parseContentAccessEvent({
      resource: "member-asset-pack",
      outcome: "granted",
    }),
  ).toThrow("requires resourceId");
  expect(() =>
    parseContentAccessEvent({
      resource: "member-asset-pack",
      resourceId: "../private",
      outcome: "granted",
    }),
  ).toThrow("resourceId is invalid");
});

test("Skills Pro events reject unexpected resource ids", () => {
  expect(
    parseContentAccessEvent({ resource: "skills-pro", outcome: "denied" }),
  ).toEqual({ resource: "skills-pro", outcome: "denied" });
  expect(() =>
    parseContentAccessEvent({
      resource: "skills-pro",
      resourceId: "another-resource",
      outcome: "granted",
    }),
  ).toThrow("does not accept resourceId");
});

test("access events are user-scoped and list limits are bounded", async () => {
  const fake = store();
  const event = await recordContentAccessEvent(
    "user_1",
    { resource: "skills-pro", outcome: "granted" },
    fake,
  );
  expect(event.id).toBe("event-user_1");

  await listContentAccessEvents("user_1", 5_000, fake);
  await listContentAccessEvents("user_1", 0, fake);
  expect(fake.limits).toEqual([100, 1]);
});
