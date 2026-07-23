import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";

import {
  recordApiAccessEvent,
  requestRoute,
  safelyAuditApiAccess,
  type ApiAccessAudit,
} from "./api-access-audit";

// Frontends allowed to mint tokens for this API (Clerk `azp` claim). Extend
// via CLERK_AUTHORIZED_PARTIES (comma-separated) when new consumers appear —
// e.g. a deadrot deployment sets its own app origins here.
const DEFAULT_PARTIES = ["http://localhost:3002", "https://app.shipshit.games"];

function authorizedParties(): string[] {
  const extra = process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map((p) => p.trim()) ?? [];
  return [...new Set([...DEFAULT_PARTIES, ...extra.filter(Boolean)])];
}

export interface AuthContext {
  userId: string;
}

type VerifySessionToken = (
  token: string,
  options: {
    secretKey: string;
    authorizedParties: string[];
  },
) => Promise<{ sub: string }>;

interface AuthDependencies {
  verify?: VerifySessionToken;
  readSecretKey?: () => string | undefined;
  audit?: ApiAccessAudit;
}

/**
 * Requires a Clerk session JWT as a Bearer token. Returns the auth context,
 * or a 401/503 response the route should return as-is.
 */
export async function requireAuth(
  req: Request,
  dependencies: AuthDependencies = {},
): Promise<AuthContext | NextResponse> {
  const audit = dependencies.audit ?? recordApiAccessEvent;
  const route = requestRoute(req);
  const deny = async (
    reason: string,
    status: 401 | 503,
    message: string,
  ) => {
    await safelyAuditApiAccess(audit, {
      boundary: "authentication",
      outcome: status === 503 ? "unavailable" : "denied",
      reason,
      route,
    });
    return NextResponse.json({ error: message }, { status });
  };
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return deny("missing-token", 401, "unauthorized");

  const secretKey = dependencies.readSecretKey
    ? dependencies.readSecretKey()
    : process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return deny("unconfigured", 503, "auth is not configured");
  }

  try {
    const verify =
      dependencies.verify
      ?? (verifyToken as unknown as VerifySessionToken);
    const payload = await verify(token, {
      secretKey,
      authorizedParties: authorizedParties(),
    });
    return { userId: payload.sub };
  } catch {
    return deny("invalid-token", 401, "unauthorized");
  }
}
