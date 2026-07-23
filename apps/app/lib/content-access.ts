import type { ContentAccessEventInput } from "@shipshitgames/shared";

import { apiFetch } from "./api";

export async function recordContentAccess(input: ContentAccessEventInput) {
  const response = await apiFetch("/v1/content/access-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Content access audit returned ${response.status}`);
  }
}
