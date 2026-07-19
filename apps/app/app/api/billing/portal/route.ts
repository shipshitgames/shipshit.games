import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { readBillingEntitlements } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";
import { appUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { studioPass: pass } = await readBillingEntitlements(userId);
  if (!pass?.stripeCustomerId) {
    return NextResponse.redirect(`${appUrl()}/dashboard`, 303);
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: pass.stripeCustomerId,
    return_url: `${appUrl()}/billing`,
  });

  return NextResponse.redirect(session.url, 303);
}
