import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { billingRepository } from "@/lib/billing-repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    userId: auth.userId,
    entitlements: await billingRepository.readEntitlements(auth.userId),
  });
}
