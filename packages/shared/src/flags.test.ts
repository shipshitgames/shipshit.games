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
