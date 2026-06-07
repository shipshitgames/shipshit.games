import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      status: "deferred",
      priority: "P3",
      message: "Skool setup is deferred until the community launch workstream.",
    },
    { status: 202 }
  );
}
