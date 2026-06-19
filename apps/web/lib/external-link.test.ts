import { describe, expect, test } from "bun:test";

import { externalLinkAttrs, isExternalHref } from "./external-link";

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

  test("protocol-relative links are external", () => {
    expect(externalLinkAttrs("//cdn.example.com/asset.js")).toEqual({
      target: "_blank",
      rel: "noreferrer",
    });
  });

  test("relative hrefs beginning with 'http' are not external", () => {
    expect(externalLinkAttrs("httpfoo")).toEqual({});
  });

  test("mailto links render a plain anchor without target=_blank", () => {
    expect(externalLinkAttrs("mailto:x@y.com")).toEqual({});
  });

  test("tel links render a plain anchor without target=_blank", () => {
    expect(externalLinkAttrs("tel:+15551234567")).toEqual({});
  });

  test("hash and relative links stay in-tab", () => {
    expect(externalLinkAttrs("#studio")).toEqual({});
    expect(externalLinkAttrs("log")).toEqual({});
  });
});

describe("isExternalHref", () => {
  test("matches absolute http and https URLs", () => {
    expect(isExternalHref("https://github.com/shipshitdev/v0")).toBe(true);
    expect(isExternalHref("http://example.com")).toBe(true);
  });

  test("matches protocol-relative URLs", () => {
    expect(isExternalHref("//cdn.example.com")).toBe(true);
  });

  test("does not match relative hrefs that merely start with 'http'", () => {
    expect(isExternalHref("httpfoo")).toBe(false);
  });

  test("does not match internal, hash, mailto, or tel hrefs", () => {
    expect(isExternalHref("/games")).toBe(false);
    expect(isExternalHref("#studio")).toBe(false);
    expect(isExternalHref("mailto:x@y.com")).toBe(false);
    expect(isExternalHref("tel:+15551234567")).toBe(false);
  });
});
