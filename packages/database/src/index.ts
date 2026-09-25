import { PrismaClient } from "./generated/index.js";

const prisma = new PrismaClient();

export { prisma, PrismaClient };
export * from "./generated/index.js";