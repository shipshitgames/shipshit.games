import {
  isContentAccessOutcome,
  isContentAccessResource,
  type ContentAccessEventInput,
} from "@shipshitgames/shared";

import { db } from "./db";

const RESOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type StoredContentAccessEvent = {
  id: string;
  resource: string;
  resourceId: string | null;
  outcome: string;
  createdAt: Date;
};

export interface ContentAccessStore {
  create(
    userId: string,
    input: ContentAccessEventInput,
  ): Promise<StoredContentAccessEvent>;
  list(userId: string, limit: number): Promise<StoredContentAccessEvent[]>;
}

const databaseContentAccessStore: ContentAccessStore = {
  create(userId, input) {
    return db.contentAccessEvent.create({
      data: {
        userId,
        resource: input.resource,
        resourceId: input.resourceId,
        outcome: input.outcome,
      },
      select: {
        id: true,
        resource: true,
        resourceId: true,
        outcome: true,
        createdAt: true,
      },
    });
  },

  list(userId, limit) {
    return db.contentAccessEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        resource: true,
        resourceId: true,
        outcome: true,
        createdAt: true,
      },
    });
  },
};

export function parseContentAccessEvent(
  value: unknown,
): ContentAccessEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Content access event must be an object");
  }
  const record = value as Record<string, unknown>;
  if (!isContentAccessResource(record.resource)) {
    throw new Error("Content access resource is invalid");
  }
  if (!isContentAccessOutcome(record.outcome)) {
    throw new Error("Content access outcome is invalid");
  }

  const resourceId = record.resourceId;
  if (
    resourceId !== undefined &&
    (typeof resourceId !== "string" || !RESOURCE_ID.test(resourceId))
  ) {
    throw new Error("Content access resourceId is invalid");
  }
  if (record.resource === "member-asset-pack" && !resourceId) {
    throw new Error("Member asset access requires resourceId");
  }
  if (record.resource === "skills-pro" && resourceId !== undefined) {
    throw new Error("Skills Pro access does not accept resourceId");
  }

  return {
    resource: record.resource,
    outcome: record.outcome,
    ...(resourceId ? { resourceId } : {}),
  };
}

export function recordContentAccessEvent(
  userId: string,
  input: ContentAccessEventInput,
  store: ContentAccessStore = databaseContentAccessStore,
) {
  return store.create(userId, input);
}

export function listContentAccessEvents(
  userId: string,
  limit: number,
  store: ContentAccessStore = databaseContentAccessStore,
) {
  return store.list(userId, Math.min(Math.max(limit, 1), 100));
}
