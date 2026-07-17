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
export type TranscriptRightsStatus =
  | "user-provided"
  | "public-captions"
  | "official-api"
  | "permissioned"
  | "unknown";
export type DerivativeKind = "rule" | "skill" | "app" | "tool";
export type DerivativeStatus = "candidate" | "active" | "rejected";

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

export interface DerivativeManifest {
  schemaVersion: 1;
  slug: string;
  kind: DerivativeKind;
  title: string;
  status: DerivativeStatus;
  sourceTranscripts: string[];
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
