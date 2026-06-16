import { describe, expect, test } from "bun:test";

import { externalLinkAttrs } from "./external-link";

describe("externalLinkAttrs", () => {
  test("external https links open in a new tab with noreferrer", () => {
    expect(externalLinkAttrs("https://github.com/shipshitdev/v0")).toEqual({
      target: "_blank",
      rel: "noreferrer",
    });
  });

  test("plain http links are also treated as external", () => {
    expect(externalLinkAttrs("http://example.com")).toEqual({
      target: "_blank",
      rel: "noreferrer",
    });
  });

  test("internal absolute paths get no target or rel", () => {
    expect(externalLinkAttrs("/games")).toEqual({});
    expect(externalLinkAttrs("/pricing")).toEqual({});
  });

  test("hash and relative links stay in-tab", () => {
    expect(externalLinkAttrs("#studio")).toEqual({});
    expect(externalLinkAttrs("log")).toEqual({});
  });
});
