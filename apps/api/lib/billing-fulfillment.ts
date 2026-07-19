import {
  isEnabled,
  SKILLS_PRO_ONETIME,
  STUDIO_PASS,
} from "@shipshitgames/shared";

export type BillingFulfillmentInput = {
  eventId: string;
  userId: string;
  email: string;
  name?: string | null;
  checkoutSessionId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type BillingFulfillmentResult = {
  skoolInviteSent: boolean;
  accessEmailSent: boolean;
};

export interface BillingFulfillment {
  fulfillStudioPass(
    input: BillingFulfillmentInput,
  ): Promise<BillingFulfillmentResult>;
  fulfillSkillsPro(
    input: BillingFulfillmentInput,
  ): Promise<Pick<BillingFulfillmentResult, "accessEmailSent">>;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
}

function claimUrl(sessionId?: string) {
  const url = new URL("/claim", appUrl());
  if (sessionId) url.searchParams.set("session_id", sessionId);
  return url.toString();
}

async function postJson(
  url: string,
  body: unknown,
  idempotencyKey: string,
  token?: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}

async function sendEmail(input: {
  eventId: string;
  email: string;
  subject: string;
  text: string;
  heading: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCESS_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `${input.eventId}:resend`,
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: input.subject,
      text: input.text,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#0a0a0a;color:#e9e3d6;padding:32px">
          <h1 style="font-family:Arial,sans-serif;text-transform:uppercase">${input.heading}</h1>
          <p>${input.text}</p>
          <p><a href="${input.ctaUrl}" style="color:#ff6a00">${input.ctaLabel}</a></p>
        </div>
      `,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  return true;
}

export const billingFulfillment: BillingFulfillment = {
  async fulfillStudioPass(input) {
    let skoolInviteSent = false;
    if (isEnabled("skoolFulfillment") && process.env.SKOOL_INVITE_WEBHOOK_URL) {
      await postJson(
        process.env.SKOOL_INVITE_WEBHOOK_URL,
        {
          deliveryKey: `${input.eventId}:skool`,
          source: "shipshitgames-api",
          product: STUDIO_PASS.productKey,
          email: input.email,
          name: input.name,
          stripeCustomerId: input.stripeCustomerId,
          stripeSubscriptionId: input.stripeSubscriptionId,
        },
        `${input.eventId}:skool`,
      );
      skoolInviteSent = true;
    }

    const url = claimUrl(input.checkoutSessionId);
    let accessEmailSent = false;
    if (process.env.FULFILLMENT_WEBHOOK_URL) {
      await postJson(
        process.env.FULFILLMENT_WEBHOOK_URL,
        {
          deliveryKey: `${input.eventId}:studio-pass`,
          source: "shipshitgames-api",
          product: STUDIO_PASS.productKey,
          email: input.email,
          name: input.name,
          claimUrl: url,
          stripeCustomerId: input.stripeCustomerId,
          stripeSubscriptionId: input.stripeSubscriptionId,
        },
        `${input.eventId}:studio-pass`,
      );
      accessEmailSent = true;
    } else {
      accessEmailSent = await sendEmail({
        eventId: input.eventId,
        email: input.email,
        subject: "Your Ship Shit Games Studio Pass access",
        text: `Your Studio Pass is ready. Open ${url} to access Skills Pro and member assets.`,
        heading: "Studio Pass is ready",
        ctaLabel: "Open access",
        ctaUrl: url,
      });
    }

    return { skoolInviteSent, accessEmailSent };
  },

  async fulfillSkillsPro(input) {
    const url = claimUrl(input.checkoutSessionId);
    if (process.env.FULFILLMENT_WEBHOOK_URL) {
      await postJson(
        process.env.FULFILLMENT_WEBHOOK_URL,
        {
          deliveryKey: `${input.eventId}:skills-pro`,
          source: "shipshitgames-api",
          product: SKILLS_PRO_ONETIME.productKey,
          email: input.email,
          name: input.name,
          claimUrl: url,
          stripeCustomerId: input.stripeCustomerId,
          checkoutSessionId: input.checkoutSessionId,
        },
        `${input.eventId}:skills-pro`,
      );
      return { accessEmailSent: true };
    }

    return {
      accessEmailSent: await sendEmail({
        eventId: input.eventId,
        email: input.email,
        subject: "Your Ship Shit Games Skills Pro access",
        text: `Skills Pro is yours. Open ${url} to sign in and access the skills.`,
        heading: "Skills Pro is yours",
        ctaLabel: "Open Skills Pro",
        ctaUrl: url,
      }),
    };
  },
};
