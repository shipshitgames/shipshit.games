import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { readBillingEntitlements } from "@/lib/billing";
import { recordContentAccess } from "@/lib/content-access";
import { privateContentUrl } from "@/lib/content-url";
import { hasSkillsProContentAccess, primaryEmail } from "@/lib/entitlements";
import { verifyAccessToken } from "@/lib/access-token";
import { appUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Invalid token",
      { status: 401 }
    );
  }

  if (payload.resource !== "skills-pro") {
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
  if (
    primaryEmail(user) !== payload.email ||
    !hasSkillsProContentAccess(entitlements)
  ) {
    await recordContentAccess({
      resource: "skills-pro",
      outcome: "denied",
    }).catch(() => undefined);
    return new NextResponse("No Skills Pro access", { status: 403 });
  }

  let targetUrl: string;
  try {
    targetUrl = privateContentUrl(
      process.env.SKILLS_PRO_PRIVATE_URL,
      "SKILLS_PRO_PRIVATE_URL",
    );
  } catch {
    await recordContentAccess({
      resource: "skills-pro",
      outcome: "unavailable",
    }).catch(() => undefined);
    return NextResponse.json(
      {
        error: "SKILLS_PRO_PRIVATE_URL is not configured yet.",
        message:
          "The signed Skills Pro gate is working, but there is no private destination URL configured.",
      },
      { status: 503 }
    );
  }

  try {
    await recordContentAccess({ resource: "skills-pro", outcome: "granted" });
  } catch {
    return new NextResponse("Access audit is temporarily unavailable", {
      status: 503,
    });
  }

  const response = NextResponse.redirect(targetUrl, 303);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
