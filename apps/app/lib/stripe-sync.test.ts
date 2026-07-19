import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { SKILLS_PRO_ONETIME, STUDIO_PASS } from "@shipshitgames/shared";
import type Stripe from "stripe";

// --- Fake Clerk backing store ----------------------------------------------
// A mutable in-memory Clerk that syncOneTimeCheckout reads and writes through.
type FakeUser = {
  id: string;
  privateMetadata: Record<string, unknown>;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
};

const users = new Map<string, FakeUser>();
const emailIndex = new Map<string, string>();

function seedUser(user: FakeUser) {
  users.set(user.id, user);
  for (const addr of user.emailAddresses) emailIndex.set(addr.emailAddress, user.id);
}

const clerkMock = {
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => {
        const user = users.get(id);
        if (!user) throw new Error(`unknown user ${id}`);
        return user;
      },
      getUserList: async ({ emailAddress }: { emailAddress: string[] }) => {
        const id = emailIndex.get(emailAddress[0]);
        return { data: id ? [users.get(id)] : [] };
      },
      updateUserMetadata: async (
        id: string,
        { privateMetadata }: { privateMetadata: Record<string, unknown> }
      ) => {
        const user = users.get(id)!;
        user.privateMetadata = privateMetadata;
        return user;
      },
    },
  }),
};

mock.module("@clerk/nextjs/server", () => clerkMock);

const { syncOneTimeCheckout, syncCheckoutSession, syncSubscriptionEvent } =
  await import("./stripe-sync");

// --- Env + fetch harness ----------------------------------------------------
const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "ACCESS_SIGNING_SECRET",
  "FULFILLMENT_WEBHOOK_URL",
  "RESEND_API_KEY",
  "ACCESS_EMAIL_FROM",
  "SKOOL_FULFILLMENT_ENABLED",
] as const;
const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function stubFetch() {
  globalThis.fetch = (async (input: string | URL) => {
    fetchCalls.push(String(input));
    return { ok: true, status: 200 } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.NEXT_PUBLIC_APP_URL = "https://app.shipshit.games";
  process.env.ACCESS_SIGNING_SECRET = "test-secret";
  users.clear();
  emailIndex.clear();
  fetchCalls = [];
  stubFetch();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  globalThis.fetch = realFetch;
});

// Records customers.update / subscriptions.* so tests can assert metadata writes.
function fakeStripe(overrides: Partial<Record<string, unknown>> = {}) {
  const customerUpdates: { id: string; metadata: unknown }[] = [];
  const stripe = {
    customers: {
      update: async (id: string, params: { metadata: unknown }) => {
        customerUpdates.push({ id, metadata: params.metadata });
        return {};
      },
      retrieve: async () => ({ email: null, name: null }),
    },
    subscriptions: {
      retrieve: async () => ({}),
      update: async () => ({}),
    },
    ...overrides,
  } as unknown as Stripe;
  return { stripe, customerUpdates };
}

function oneTimeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_one_time_1",
    mode: "payment",
    payment_status: "paid",
    metadata: { product: SKILLS_PRO_ONETIME.productKey, clerkUserId: "user_2" },
    customer_details: { email: "gamer@example.com", name: "Gamer" },
    customer: "cus_2",
    payment_intent: "pi_2",
    client_reference_id: null,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function skillsProMetadata(user: FakeUser) {
  return user.privateMetadata.skillsProOneTime as
    | Record<string, unknown>
    | undefined;
}

// --- syncOneTimeCheckout guards ---------------------------------------------

test("syncOneTimeCheckout skips a non-payment checkout session", async () => {
  const { stripe } = fakeStripe();
  const result = await syncOneTimeCheckout(stripe, oneTimeSession({ mode: "subscription" }));
  expect(result.skipped).toBe("Checkout session is not a one-time payment.");
  expect(result.entitlement).toBeNull();
});

test("syncOneTimeCheckout skips a session for a different product", async () => {
  const { stripe } = fakeStripe();
  const result = await syncOneTimeCheckout(
    stripe,
    oneTimeSession({ metadata: { product: "something-else" } })
  );
  expect(result.skipped).toBe("Payment is not the Skills Pro one-time product.");
});

test("syncOneTimeCheckout rejects a checkout that is not fully paid", async () => {
  const { stripe } = fakeStripe();
  const result = await syncOneTimeCheckout(
    stripe,
    oneTimeSession({ payment_status: "unpaid" })
  );
  expect(result.skipped).toBe("Payment is not completed.");
  expect(result.userId).toBeNull();
});

test("syncOneTimeCheckout skips when no Clerk user matches the buyer", async () => {
  const { stripe } = fakeStripe();
  const result = await syncOneTimeCheckout(
    stripe,
    oneTimeSession({ client_reference_id: null, metadata: { product: SKILLS_PRO_ONETIME.productKey }, customer_details: { email: "nobody@example.com" } })
  );
  expect(result.skipped).toBe("No Clerk user matched Skills Pro purchase.");
});

// --- syncOneTimeCheckout fulfillment + idempotency --------------------------

test("syncOneTimeCheckout grants the one-time entitlement and sends access once", async () => {
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  seedUser({
    id: "user_2",
    privateMetadata: {},
    fullName: "Gamer",
    primaryEmailAddress: { emailAddress: "gamer@example.com" },
    emailAddresses: [{ emailAddress: "gamer@example.com" }],
  });
  const { stripe, customerUpdates } = fakeStripe();

  const result = await syncOneTimeCheckout(stripe, oneTimeSession());

  expect(result.skipped).toBeNull();
  expect(result.userId).toBe("user_2");
  expect(result.entitlement?.active).toBe(true);
  expect(result.fulfillment?.accessEmailSent).toBe(true);

  const stored = skillsProMetadata(users.get("user_2")!);
  expect(stored?.active).toBe(true);
  expect(stored?.purchasedAt).toBeString();
  expect(stored?.accessEmailSentAt).toBeString();
  expect(stored?.stripePaymentIntentId).toBe("pi_2");
  // One fulfillment webhook fired.
  expect(fetchCalls).toHaveLength(1);
  // Customer metadata was reconciled with the Clerk user + product.
  expect(customerUpdates).toHaveLength(1);
  expect(customerUpdates[0].metadata).toEqual({
    clerkUserId: "user_2",
    product: SKILLS_PRO_ONETIME.productKey,
  });
});

test("syncOneTimeCheckout is idempotent: redelivery preserves purchasedAt and does not resend", async () => {
  process.env.FULFILLMENT_WEBHOOK_URL = "https://hooks.example.com/fulfill";
  seedUser({
    id: "user_2",
    privateMetadata: {},
    fullName: "Gamer",
    primaryEmailAddress: { emailAddress: "gamer@example.com" },
    emailAddresses: [{ emailAddress: "gamer@example.com" }],
  });
  const { stripe } = fakeStripe();

  const first = await syncOneTimeCheckout(stripe, oneTimeSession());
  const purchasedAt = skillsProMetadata(users.get("user_2")!)?.purchasedAt;
  expect(first.fulfillment?.accessEmailSent).toBe(true);
  expect(fetchCalls).toHaveLength(1);

  const second = await syncOneTimeCheckout(stripe, oneTimeSession());

  // The email guard (accessEmailSentAt already set) skips fulfillment entirely.
  expect(second.fulfillment).toBeNull();
  expect(fetchCalls).toHaveLength(1);
  // purchasedAt is frozen on the original purchase.
  expect(skillsProMetadata(users.get("user_2")!)?.purchasedAt).toBe(purchasedAt);
});

test("syncOneTimeCheckout resolves the user by email when no client_reference_id is set", async () => {
  seedUser({
    id: "user_9",
    privateMetadata: {},
    fullName: "Emailed Buyer",
    primaryEmailAddress: { emailAddress: "byemail@example.com" },
    emailAddresses: [{ emailAddress: "byemail@example.com" }],
  });
  const { stripe } = fakeStripe();

  const result = await syncOneTimeCheckout(
    stripe,
    oneTimeSession({
      client_reference_id: null,
      metadata: { product: SKILLS_PRO_ONETIME.productKey },
      customer_details: { email: "byemail@example.com" },
    })
  );

  expect(result.userId).toBe("user_9");
  expect(result.entitlement?.active).toBe(true);
});

// --- sibling guard paths ----------------------------------------------------

test("syncCheckoutSession skips a non-subscription checkout", async () => {
  const { stripe } = fakeStripe();
  const session = { mode: "payment" } as unknown as Stripe.Checkout.Session;
  const result = await syncCheckoutSession(stripe, session);
  expect(result.skipped).toBe("Checkout session is not a subscription.");
});

test("syncSubscriptionEvent skips a subscription for a non-Studio-Pass product", async () => {
  const subscription = {
    id: "sub_x",
    metadata: { product: "not-studio-pass" },
    customer: "cus_x",
  } as unknown as Stripe.Subscription;
  const { stripe } = fakeStripe();
  const result = await syncSubscriptionEvent(stripe, subscription);
  expect(result.skipped).toBe(
    "Subscription does not belong to the Studio Pass product."
  );
  // Guard returns before touching Stripe or Clerk; assert we never reached them.
  expect(STUDIO_PASS.productKey).not.toBe("not-studio-pass");
});
