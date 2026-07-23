import { requireAuth } from "@/lib/auth";
import { generationJobRepository } from "@/lib/generation-job-repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { jobId } = await context.params;
  const job = await generationJobRepository.find(auth.userId, jobId);
  if (!job) {
    return Response.json(
      { error: "generation job not found" },
      { status: 404 },
    );
  }
  return Response.json({
    id: job.id,
    status: job.status,
    attempts: job.attemptCount,
    result: job.result,
    error: job.error,
  });
}
