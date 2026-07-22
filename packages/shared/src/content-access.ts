export const CONTENT_ACCESS_RESOURCES = [
  "skills-pro",
  "member-asset-pack",
] as const;

export type ContentAccessResource = (typeof CONTENT_ACCESS_RESOURCES)[number];

export const CONTENT_ACCESS_OUTCOMES = [
  "granted",
  "denied",
  "unavailable",
] as const;

export type ContentAccessOutcome = (typeof CONTENT_ACCESS_OUTCOMES)[number];

export type ContentAccessEventInput = {
  resource: ContentAccessResource;
  resourceId?: string;
  outcome: ContentAccessOutcome;
};

export function isContentAccessResource(
  value: unknown,
): value is ContentAccessResource {
  return CONTENT_ACCESS_RESOURCES.includes(value as ContentAccessResource);
}

export function isContentAccessOutcome(
  value: unknown,
): value is ContentAccessOutcome {
  return CONTENT_ACCESS_OUTCOMES.includes(value as ContentAccessOutcome);
}
