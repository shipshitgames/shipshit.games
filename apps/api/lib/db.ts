import { PrismaClient } from "@prisma/client";

// One client per process; Next dev hot-reloads modules, so park it on global.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
