/**
 * Entry point. Reads configuration, starts listening, and shuts down cleanly.
 *
 * Run with `npm start`.
 */

import type { AddressInfo } from "node:net";

import { createApp } from "./app.ts";
import { resolvePort } from "./config.ts";

let port: number;
try {
  port = resolvePort(process.env);
} catch (error) {
  // Fail immediately and loudly on bad configuration. A server that silently
  // falls back to a default port is worse than one that refuses to start.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const server = createApp();

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
      process.exit(0);
    });
  });
}
