import { expect, test } from "bun:test";
import type { User } from "@clerk/nextjs/server";

import { primaryEmail } from "./entitlements";

test("primaryEmail returns the primary address when present", () => {
  const user = {
    primaryEmailAddress: { emailAddress: "primary@example.com" },
    emailAddresses: [{ emailAddress: "secondary@example.com" }],
  } as unknown as User;
  expect(primaryEmail(user)).toBe("primary@example.com");
});

test("primaryEmail falls back to the first address when no primary is set", () => {
  const user = {
    primaryEmailAddress: null,
    emailAddresses: [{ emailAddress: "first@example.com" }],
  } as unknown as User;
  expect(primaryEmail(user)).toBe("first@example.com");
});

test("primaryEmail returns null when the user has no addresses", () => {
  const user = {
    primaryEmailAddress: null,
    emailAddresses: [],
  } as unknown as User;
  expect(primaryEmail(user)).toBeNull();
});

test("primaryEmail tolerates a null user", () => {
  expect(primaryEmail(null)).toBeNull();
  expect(primaryEmail(undefined)).toBeNull();
});
