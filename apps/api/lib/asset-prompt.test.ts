import { expect, test } from "bun:test";

import { spritePrompt } from "./asset-prompt";

test("spritePrompt keeps ordinary reference reprints pose-only", () => {
  const prompt = spritePrompt({
    subject: "Warden",
    gameSlug: "scourge-survivors",
    pose: "running",
    fromReference: true,
  });

  expect(prompt).toContain("only change the pose and angle");
  expect(prompt).not.toContain("targeted edit:");
});

test("spritePrompt applies a targeted edit while locking unmentioned details", () => {
  const prompt = spritePrompt({
    subject: "Warden",
    description: "bone armor and a rusted harness",
    gameSlug: "scourge-survivors",
    pose: "idle",
    fromReference: true,
    editInstruction: "  add a glowing toxic core  ",
  });

  expect(prompt).toContain("targeted edit: add a glowing toxic core");
  expect(prompt).toContain("change only what the targeted edit requests");
  expect(prompt).not.toContain("only change the pose and angle");
});
