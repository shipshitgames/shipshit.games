import { db } from "./db";

export type ApiAccessBoundary = "authentication" | "studio-pass";
export type ApiAccessOutcome = "granted" | "denied" | "unavailable";

export interface ApiAccessEventInput {
  boundary: ApiAccessBoundary;
  outcome: ApiAccessOutcome;
  reason: string;
  route: string;
  userId?: string;
}

export type ApiAccessAudit = (
  event: ApiAccessEventInput,
) => Promise<unknown>;

export function requestRoute(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

export function recordApiAccessEvent(
  event: ApiAccessEventInput,
): Promise<unknown> {
  return db.apiAccessEvent.create({
    data: {
      boundary: event.boundary,
      outcome: event.outcome,
      reason: event.reason,
      route: event.route,
      ...(event.userId ? { userId: event.userId } : {}),
    },
    select: { id: true },
  });
}

/**
 * Access decisions must fail closed based on auth/entitlement state, not on
 * whether the secondary audit write succeeds.
 */
export async function safelyAuditApiAccess(
  audit: ApiAccessAudit,
  event: ApiAccessEventInput,
): Promise<void> {
  try {
    await audit(event);
  } catch {
    // The primary boundary response remains authoritative.
  }
}
