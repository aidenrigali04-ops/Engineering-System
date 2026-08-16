/**
 * Entry point. Reads configuration, starts listening, and shuts down cleanly.
 *
 * Run with `npm start`.
 */

import type { AddressInfo } from "node:net";

import { PrismaClient } from "@prisma/client";

import { createApp } from "./app.ts";
import { resolveDatabaseUrl, resolvePort } from "./config.ts";
import { createPgRepositoryStore } from "./pg-store.ts";

let port: number;
let databaseUrl: string;
try {
  port = resolvePort(process.env);
  databaseUrl = resolveDatabaseUrl(process.env);
} catch (error) {
  // Fail immediately and loudly on bad configuration. A server that silently
  // falls back to a default is worse than one that refuses to start.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

const server = createApp({
  store: createPgRepositoryStore(prisma),
  // SELECT 1 answers "is the database reachable" and nothing else, which is
  // exactly the readiness question.
  checkReadiness: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

server.listen(port, () => {
  const address = server.address() as AddressInfo;
  console.log(`Listening on http://localhost:${address.port}`);
});

server.on("error", (error: Error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exit(1);
});

/**
 * Container runtimes send SIGTERM and then kill the process shortly after.
 * Closing the server first lets in-flight requests finish instead of being
 * severed mid-response.
 */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down.`);
    server.close(() => {
      void prisma.$disconnect().finally(() => {
        process.exit(0);
      });
    });
  });
}
