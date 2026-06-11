import { Prisma } from "@/generated/client";
import { db } from "./db";

/**
 * Persist a verified webhook delivery. Returns false when the provider
 * already delivered this event (idempotent redelivery) so handlers can skip
 * side effects.
 */
export async function recordWebhookEvent(
  source: "stripe" | "clerk" | "github",
  externalId: string | null,
  type: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await db.webhookEvent.create({
      data: { source, externalId, type, payload: payload as Prisma.InputJsonValue },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false; // duplicate delivery
    }
    throw e;
  }
}
