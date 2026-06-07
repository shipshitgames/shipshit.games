import { STUDIO_PASS } from "@shipshitgames/shared";

import { createAccessToken } from "./access-token";
import type { StudioPassEntitlement } from "./entitlements";
import { appUrl } from "./urls";

export type FulfillmentInput = {
  userId?: string;
  email: string;
  name?: string | null;
  entitlement?: StudioPassEntitlement | null;
  checkoutSessionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

type FulfillmentResult = {
  skoolInviteSent: boolean;
  accessEmailSent: boolean;
  error?: string;
};

function bearerHeaders(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function createClaimUrl(sessionId: string) {
  const url = new URL("/claim", appUrl());
  url.searchParams.set("session_id", sessionId);
  return url.toString();
}

export function createSkillsProAccessUrl(userId: string, email: string) {
  const token = createAccessToken({
    sub: userId,
    email,
    resource: "skills-pro",
  });
  const url = new URL("/api/access/skills-pro", appUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

async function postJson(url: string, body: unknown, token?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bearerHeaders(token),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
}

export async function sendSkoolInvite(input: FulfillmentInput) {
  const webhookUrl = process.env.SKOOL_INVITE_WEBHOOK_URL;
  if (!webhookUrl) return false;

  await postJson(webhookUrl, {
    source: "shipshitgames-app",
    product: STUDIO_PASS.productKey,
    email: input.email,
    name: input.name,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
  });

  return true;
}

async function sendFulfillmentWebhook(input: FulfillmentInput, accessUrl?: string) {
  const webhookUrl = process.env.FULFILLMENT_WEBHOOK_URL;
  if (!webhookUrl) return false;

  await postJson(webhookUrl, {
    source: "shipshitgames-app",
    product: STUDIO_PASS.productKey,
    email: input.email,
    name: input.name,
    claimUrl: input.checkoutSessionId
      ? createClaimUrl(input.checkoutSessionId)
      : undefined,
    skillsProAccessUrl: accessUrl,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
  });

  return true;
}

async function sendResendEmail(input: FulfillmentInput, accessUrl?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCESS_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const claimUrl = input.checkoutSessionId
    ? createClaimUrl(input.checkoutSessionId)
    : undefined;
  const ctaUrl = accessUrl ?? claimUrl ?? `${appUrl()}/dashboard`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: "Your Ship Shit Games Studio Pass access",
      text: `Your Studio Pass is ready. Open ${ctaUrl} to claim Skills Pro, community access, and member assets.`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#0a0a0a;color:#e9e3d6;padding:32px">
          <h1 style="font-family:Arial,sans-serif;text-transform:uppercase">Studio Pass is ready</h1>
          <p>Open your Ship Shit Games app portal to claim Skills Pro, community access, and member assets.</p>
          <p><a href="${ctaUrl}" style="color:#ff6a00">Claim access</a></p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }

  return true;
}

export async function runFulfillment(input: FulfillmentInput): Promise<FulfillmentResult> {
  const accessUrl =
    input.userId && input.email
      ? createSkillsProAccessUrl(input.userId, input.email)
      : undefined;

  const result: FulfillmentResult = {
    skoolInviteSent: false,
    accessEmailSent: false,
  };

  try {
    result.skoolInviteSent = await sendSkoolInvite(input);
    result.accessEmailSent =
      (await sendFulfillmentWebhook(input, accessUrl)) ||
      (await sendResendEmail(input, accessUrl));
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Fulfillment failed";
  }

  return result;
}
