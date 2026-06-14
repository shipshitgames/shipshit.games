import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UsageLogEvent {
  timestamp?: string;
  command: "generate" | "matrix" | "expand" | "import";
  provider: string;
  kind: string;
  success: boolean;
  durationMs: number;
  game?: string;
  id?: string;
  model?: string;
  size?: number | string;
  outputPath?: string;
  prompt?: string;
  error?: unknown;
}

export interface WrittenUsageLogEvent extends Omit<UsageLogEvent, "prompt" | "error"> {
  timestamp: string;
  promptHash?: string;
  promptChars?: number;
  error?: string;
}

const DISABLED = new Set(["0", "false", "off", "none", ""]);

export function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export function defaultUsageLogPath(): string {
  return join(homedir(), ".shipshitgames", "assetgen", "usage.jsonl");
}

export function resolveUsageLogPath(explicit?: string | null): string | undefined {
  const value = explicit ?? process.env.SHIPSHIT_ASSETGEN_USAGE_LOG;
  if (value !== undefined) {
    const trimmed = value.trim();
    if (DISABLED.has(trimmed.toLowerCase())) return undefined;
    return trimmed;
  }
  return defaultUsageLogPath();
}

export async function appendUsageLog(event: UsageLogEvent, explicitPath?: string | null): Promise<string | undefined> {
  const logPath = resolveUsageLogPath(explicitPath);
  if (!logPath) return undefined;
  const written = toWrittenUsageEvent(event);
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify(written) + "\n", "utf8");
  return logPath;
}

export function toWrittenUsageEvent(event: UsageLogEvent): WrittenUsageLogEvent {
  const written: WrittenUsageLogEvent = {
    timestamp: event.timestamp ?? new Date().toISOString(),
    command: event.command,
    provider: event.provider,
    kind: event.kind,
    success: event.success,
    durationMs: event.durationMs,
  };
  if (event.game) written.game = event.game;
  if (event.id) written.id = event.id;
  if (event.model) written.model = event.model;
  if (event.size !== undefined) written.size = event.size;
  if (event.outputPath) written.outputPath = event.outputPath;
  if (event.prompt) {
    written.promptHash = promptHash(event.prompt);
    written.promptChars = event.prompt.length;
  }
  if (event.error) written.error = errorText(event.error);
  return written;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}
