// Webhook payloads are KBs (GitHub caps deliveries at 25MB); these endpoints
// are unauthenticated, so cap how much body we'll buffer before verification.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Read the raw body up to the cap; null means too large (respond 413). */
export async function readBodyCapped(
  req: Request,
  max: number = MAX_BODY_BYTES,
): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
