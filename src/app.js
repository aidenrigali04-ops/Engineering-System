/**
 * The HTTP application: routing and handlers.
 *
 * Creating the server is deliberately separate from listening on a port, so
 * tests can start it on an ephemeral port and shut it down cleanly.
 */

import { createServer } from "node:http";

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Reports whether this process is able to serve requests.
 *
 * Intentionally shallow. A health check should only fail for conditions the
 * caller's reaction would actually fix — restarting this process cannot repair
 * someone else's outage, so third-party checks do not belong here.
 */
function handleHealth(_req, res) {
  sendJson(res, 200, {
    status: "ok",
    uptime: Math.floor(process.uptime()),
  });
}

function handleNotFound(_req, res) {
  sendJson(res, 404, { error: "not_found" });
}

const routes = new Map([["GET /health", handleHealth]]);

export function createApp() {
  return createServer((req, res) => {
    // The URL is parsed rather than compared directly so that a query string
    // does not turn /health into an unknown route.
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const handler = routes.get(`${req.method} ${pathname}`) ?? handleNotFound;

    handler(req, res);
  });
}
