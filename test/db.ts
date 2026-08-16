/**
 * Gives each test file its own throwaway Postgres schema.
 *
 * node --test runs test files as separate processes in parallel. Two files
 * sharing one schema would interfere; a schema per file keeps them isolated
 * while still exercising the real database, which is the point of these tests.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

export interface TestDb {
  prisma: PrismaClient;
  destroy(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const base =
    process.env.DATABASE_URL ??
    "postgresql://evalgate:evalgate@localhost:5432/evalgate";
  const schema = `test_${randomUUID().replaceAll("-", "")}`;

  const url = new URL(base);
  url.searchParams.set("schema", schema);
  const databaseUrl = url.toString();

  // db push creates the tables from schema.prisma without touching the
  // migration history — right for a schema that exists for one test run.
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  return {
    prisma,
    async destroy() {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await prisma.$disconnect();
    },
  };
}
