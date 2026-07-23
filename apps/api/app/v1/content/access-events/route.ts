import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  listContentAccessEvents,
  parseContentAccessEvent,
  recordContentAccessEvent,
} from "@/lib/content-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const requestedLimit = Number(
    new URL(req.url).searchParams.get("limit") ?? 25,
  );
  const limit = Number.isInteger(requestedLimit) ? requestedLimit : 25;
  return NextResponse.json({
    events: await listContentAccessEvents(auth.userId, limit),
  });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let input;
  try {
    input = parseContentAccessEvent(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid event" },
      { status: 400 },
    );
  }

  const event = await recordContentAccessEvent(auth.userId, input);
  return NextResponse.json({ event }, { status: 201 });
}
