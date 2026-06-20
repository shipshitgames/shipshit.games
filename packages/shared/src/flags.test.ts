import { afterEach, describe, expect, it } from "bun:test";

import { FLAGS, flagSnapshot, isEnabled, isFlagValueOn } from "./flags";

const ENV = FLAGS.skoolFulfillment.env;

afterEach(() => {
  delete process.env[ENV];
});

describe("isEnabled", () => {
  it("is off when the env var is unset (fails closed)", () => {
    delete process.env[ENV];
    expect(isEnabled("skoolFulfillment")).toBe(false);
  });

  for (const value of ["true", "TRUE", "1", "on", "Yes", " true "]) {
    it(`is on for truthy value ${JSON.stringify(value)}`, () => {
      process.env[ENV] = value;
      expect(isEnabled("skoolFulfillment")).toBe(true);
    });
  }

  for (const value of ["false", "0", "off", "no", "", "enabled"]) {
    it(`is off for non-truthy value ${JSON.stringify(value)}`, () => {
      process.env[ENV] = value;
      expect(isEnabled("skoolFulfillment")).toBe(false);
    });
  }
});

describe("isFlagValueOn", () => {
  it("treats null and undefined as off", () => {
    expect(isFlagValueOn(null)).toBe(false);
    expect(isFlagValueOn(undefined)).toBe(false);
  });
});

describe("FLAGS registry", () => {
  it("registers only server flags (no client/NEXT_PUBLIC_ field)", () => {
    for (const def of Object.values(FLAGS)) {
      // The seam is server-only; `isEnabled` reads process.env dynamically and
      // cannot deliver client flags. There must be no `client` field to imply it.
      expect(Object.keys(def)).not.toContain("client");
      expect(def.env.startsWith("NEXT_PUBLIC_")).toBe(false);
    }
  });
});

describe("flagSnapshot", () => {
  it("reports every registered flag", () => {
    const snap = flagSnapshot();
    expect(Object.keys(snap).sort()).toEqual(Object.keys(FLAGS).sort());
  });

  it("reflects the live env value", () => {
    process.env[ENV] = "true";
    expect(flagSnapshot().skoolFulfillment).toBe(true);
    process.env[ENV] = "false";
    expect(flagSnapshot().skoolFulfillment).toBe(false);
  });
});
