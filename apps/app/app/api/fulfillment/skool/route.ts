import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { hasActiveStudioPass, primaryEmail, readStudioPass, updateStudioPassEntitlement } from "@/lib/entitlements";
import { sendSkoolInvite } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await currentUser();
  const email = primaryEmail(user);
  if (!user || !email || !hasActiveStudioPass(user.privateMetadata)) {
    return new NextResponse("No active Studio Pass", { status: 403 });
  }

  const pass = readStudioPass(user.privateMetadata);
  const sent = await sendSkoolInvite({
    userId,
    email,
    name: user.fullName,
    entitlement: pass,
    stripeCustomerId: pass?.stripeCustomerId,
    stripeSubscriptionId: pass?.stripeSubscriptionId,
  });

  if (sent) {
    await updateStudioPassEntitlement(userId, {
      skoolInviteSentAt: new Date().toISOString(),
    });
  }

  return NextResponse.redirect("/access", 303);
}
