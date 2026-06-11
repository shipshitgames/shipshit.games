import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const MAX_WINDOW_DAYS = 365;

// Commit activity aggregated from GitHub push webhooks.
// GET /v1/stats/commits?repo=<owner/name>&days=<n, default 30>
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? undefined;
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), MAX_WINDOW_DAYS);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = { committedAt: { gte: since }, ...(repo ? { repo } : {}) };

  const [total, byRepo, byAuthor, recent] = await Promise.all([
    db.commit.count({ where }),
    db.commit.groupBy({
      by: ["repo"],
      where,
      _count: { _all: true },
      orderBy: { _count: { sha: "desc" } },
    }),
    db.commit.groupBy({
      by: ["authorLogin"],
      where,
      _count: { _all: true },
      orderBy: { _count: { sha: "desc" } },
    }),
    db.commit.findMany({
      where,
      select: { repo: true, sha: true, message: true, authorLogin: true, committedAt: true },
      orderBy: { committedAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    windowDays: days,
    since: since.toISOString(),
    total,
    byRepo: byRepo.map((r) => ({ repo: r.repo, commits: r._count._all })),
    byAuthor: byAuthor.map((a) => ({ author: a.authorLogin ?? "unknown", commits: a._count._all })),
    recent,
  });
}
