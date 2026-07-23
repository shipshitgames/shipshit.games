import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { verifyAccessToken } from "@/lib/access-token";
import { readBillingEntitlements } from "@/lib/billing";
import { recordContentAccess } from "@/lib/content-access";
import { hasActiveStudioPass, primaryEmail } from "@/lib/entitlements";
import { memberAssetPackDestination } from "@/lib/member-assets";
import { appUrl } from "@/lib/urls";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ packId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { packId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Invalid token",
      { status: 401 },
    );
  }
  if (
    payload.resource !== "member-asset-pack" ||
    payload.resourceId !== packId
  ) {
    return new NextResponse("Invalid resource", { status: 400 });
  }

  const { userId } = await auth();
  if (userId !== payload.sub) {
    const url = new URL("/sign-in", appUrl());
    url.searchParams.set("redirect_url", request.url);
    return NextResponse.redirect(url, 303);
  }

  const client = await clerkClient();
  const [user, entitlements] = await Promise.all([
    client.users.getUser(payload.sub),
    readBillingEntitlements(payload.sub),
  ]);
  const event = {
    resource: "member-asset-pack" as const,
    resourceId: packId,
  };
  if (
    primaryEmail(user) !== payload.email ||
    !hasActiveStudioPass(entitlements.studioPass)
  ) {
    await recordContentAccess({ ...event, outcome: "denied" }).catch(
      () => undefined,
    );
    return new NextResponse("No member asset access", { status: 403 });
  }

  const destination = memberAssetPackDestination(packId);
  if (!destination) {
    await recordContentAccess({ ...event, outcome: "unavailable" }).catch(
      () => undefined,
    );
    return new NextResponse("Member asset pack not found", { status: 404 });
  }

  try {
    await recordContentAccess({ ...event, outcome: "granted" });
  } catch {
    return new NextResponse("Access audit is temporarily unavailable", {
      status: 503,
    });
  }

  const response = NextResponse.redirect(destination, 303);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
