export type SourceKind =
  | "youtube-channel"
  | "youtube-video"
  | "article"
  | "course"
  | "book"
  | "docs"
  | "other";

export type SourcePriority = "primary" | "reference" | "inbox";
export type SourceStatus = "active" | "paused" | "archived";
export const TRANSCRIPT_RIGHTS_STATUSES = [
  "user-provided",
  "public-captions",
  "official-api",
  "permissioned",
  "unknown",
] as const;
export type TranscriptRightsStatus = (typeof TRANSCRIPT_RIGHTS_STATUSES)[number];
export const DUPLICATE_POLICIES = ["skip", "overwrite", "versioned"] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];
export type DerivativeKind = "rule" | "skill" | "app" | "tool";
export type DerivativeStatus = "candidate" | "active" | "rejected";

export function isTranscriptRightsStatus(value: string): value is TranscriptRightsStatus {
  return (TRANSCRIPT_RIGHTS_STATUSES as readonly string[]).includes(value);
}

export function isDuplicatePolicy(value: string): value is DuplicatePolicy {
  return (DUPLICATE_POLICIES as readonly string[]).includes(value);
}

export interface SourceRights {
  transcriptPolicy: TranscriptRightsStatus;
  storeRawTranscript: boolean;
  notes: string;
}

export interface SourceManifest {
  schemaVersion: 1;
  slug: string;
  kind: SourceKind;
  title: string;
  url: string;
  priority: SourcePriority;
  status: SourceStatus;
  handle?: string;
  channelId?: string;
  owner?: string;
  topics: string[];
  rights: SourceRights;
  desiredOutputs: DerivativeKind[];
  notes: string[];
}

export interface TranscriptResource {
  schemaVersion: 1;
  slug: string;
  sourceSlug: string;
  sourceKind: SourceKind;
  title: string;
  url: string;
  capturedAt: string;
  transcriptPath?: string;
  transcriptFormat?: "markdown" | "plain-text" | "youtube-timedtext";
  rights: {
    status: TranscriptRightsStatus;
    notes: string;
  };
  tags: string[];
  derivatives: {
    rulesPath?: string;
    skillCandidates: string[];
    appCandidates: string[];
    toolCandidates: string[];
  };
}

export interface TimedTranscriptSegment {
  startSeconds: number;
  durationSeconds: number;
  text: string;
}

export type StreamContentProvider = "codex" | "mock";

export interface StreamChapter {
  startSeconds: number;
  title: string;
}

export interface StreamClipCandidate {
  startSeconds: number;
  endSeconds: number;
  title: string;
  hook: string;
  rationale: string;
}

export interface GeneratedStreamContent {
  chapters: StreamChapter[];
  clips: StreamClipCandidate[];
  newsletter: {
    subject: string;
    previewText: string;
    markdown: string;
  };
  devlog: {
    title: string;
    summary: string;
    markdown: string;
  };
}

export interface StreamContentManifest {
  schemaVersion: 1;
  slug: string;
  sourceSlug: string;
  title: string;
  url: string;
  createdAt: string;
  provider: StreamContentProvider;
  transcript: {
    sha256: string;
    rightsStatus: TranscriptRightsStatus;
    segmentCount: number;
    durationSeconds: number;
  };
  outputs: {
    chapters: string;
    clips: string;
    newsletter: string;
    devlog: string;
  };
  chapterCount: number;
  clipCount: number;
}

export interface DerivativeManifest {
  schemaVersion: 1;
  slug: string;
  kind: DerivativeKind;
  title: string;
  status: DerivativeStatus;
  sourceTranscripts: string[];
  sourceRules?: string[];
  outputPath: string;
  summary: string;
  tags: string[];
}

export interface SyncedVideo {
  videoId: string;
  title: string;
  url: string;
  durationSeconds?: number;
  uploadDate?: string;
}

export interface SyncedChannelVideos {
  schemaVersion: 1;
  sourceSlug: string;
  syncedAt: string;
  via: "yt-dlp";
  videos: SyncedVideo[];
}
