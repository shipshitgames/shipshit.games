import { expect, test } from "bun:test";

import {
  memberAssetPackDestination,
  parseMemberAssetPacks,
  publishedMemberAssetPacks,
} from "./member-assets";

const packs = JSON.stringify([
  {
    id: "july-sprite-drop",
    title: "July sprite drop",
    description: "Production-ready sprite references.",
    publishedAt: "2026-07-01T00:00:00.000Z",
    privateUrl: "https://downloads.shipshit.games/july.zip?token=example",
  },
  {
    id: "august-sprite-drop",
    title: "August sprite drop",
    description: "The next member pack.",
    publishedAt: "2026-08-01T00:00:00.000Z",
    privateUrl: "https://downloads.shipshit.games/august.zip?token=example",
  },
]);

test("published packs expose metadata without leaking private destinations", () => {
  const result = publishedMemberAssetPacks(
    new Date("2026-07-22T00:00:00.000Z"),
    packs,
  );

  expect(result).toEqual([
    {
      id: "july-sprite-drop",
      title: "July sprite drop",
      description: "Production-ready sprite references.",
      publishedAt: "2026-07-01T00:00:00.000Z",
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("downloads.shipshit.games");
});

test("a published pack destination resolves only by exact id", () => {
  expect(
    memberAssetPackDestination(
      "july-sprite-drop",
      new Date("2026-07-22T00:00:00.000Z"),
      packs,
    ),
  ).toBe("https://downloads.shipshit.games/july.zip?token=example");
  expect(
    memberAssetPackDestination(
      "august-sprite-drop",
      new Date("2026-07-22T00:00:00.000Z"),
      packs,
    ),
  ).toBeNull();
});

test("member pack configuration fails closed on duplicate ids and unsafe URLs", () => {
  const duplicate = JSON.stringify([
    JSON.parse(packs)[0],
    JSON.parse(packs)[0],
  ]);
  expect(() => parseMemberAssetPacks(duplicate)).toThrow(
    "Duplicate member asset pack id",
  );
  expect(() =>
    parseMemberAssetPacks(
      JSON.stringify([
        {
          ...JSON.parse(packs)[0],
          privateUrl: "javascript:alert(1)",
        },
      ]),
    ),
  ).toThrow("must use HTTPS");
});
