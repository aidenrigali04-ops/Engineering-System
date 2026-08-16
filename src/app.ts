/**
 * The HTTP application: routing, request parsing, and status codes.
 *
 * Everything here is about HTTP. Deciding whether input is valid, or whether a
 * record exists, belongs to the modules this delegates to — which is what lets
 * those be tested without a server.
 *
 * Creating the server is deliberately separate from listening on a port, so
 * tests can start it on an ephemeral port and shut it down cleanly.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Server } from "node:http";

import {
  createRepositories,
  type FailureCode,
  type Repositories,
  type TrackedRepository,
} from "./repositories.ts";
import type { Store } from "./store.ts";

/**
 * Bodies are capped because an unbounded read is a denial-of-service waiting
 * to happen: without a limit, one request can grow the heap until the process
 * dies. Nothing this API accepts comes close to this size.
 */
const MAX_BODY_BYTES = 16 * 1024;

/** Domain failures carry a code; HTTP is where that becomes a status number. */
const STATUS_BY_CODE: Record<FailureCode, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
};

type RouteParams = Record<string, string>;

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
) => void | Promise<void>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; code: "too_large" | "empty" | "malformed" };

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

function sendFailure(
  res: ServerResponse,
  code: FailureCode,
  details: string[],
): void {
  sendJson(res, STATUS_BY_CODE[code], { error: code, details });
}

/**
 * Reads the body and parses it as JSON.
 *
 * Returns a result rather than throwing, because none of these outcomes are
 * exceptional — they are all things a client will do, and each needs a
 * different status code.
 */
async function readJsonBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      return { ok: false, code: "too_large" };
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    return { ok: false, code: "empty" };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, code: "malformed" };
  }
}

/**
 * Reports whether this process is able to serve requests.
 *
 * Intentionally shallow. A health check should only fail for conditions the
 * caller's reaction would actually fix — restarting this process cannot repair
 * someone else's outage, so third-party checks do not belong here.
 */
function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: "ok",
    uptime: Math.floor(process.uptime()),
  });
}

/**
 * Reports whether this instance should receive traffic, which is a different
 * question from /health. Liveness asks "would a restart fix this process?"
 * Readiness asks "can it do real work right now?" — and a database it cannot
 * reach means no, without meaning a restart would help.
 */
function buildReadyHandler(check: () => Promise<void>): Handler {
  return async (_req, res) => {
    try {
      await check();
      sendJson(res, 200, { status: "ready" });
    } catch {
      sendJson(res, 503, { status: "unavailable" });
    }
  };
}

function handleNotFound(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 404, { error: "not_found" });
}

function buildRoutes(repositories: Repositories, ready: Handler): Route[] {
  async function handleCreate(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readJsonBody(req);

    if (!body.ok) {
      if (body.code === "too_large") {
        sendJson(res, 413, {
          error: "payload_too_large",
          details: [`The request body must be under ${MAX_BODY_BYTES} bytes.`],
        });
        return;
      }

      sendJson(res, 400, {
        error: "invalid",
        details: [
          body.code === "empty"
            ? "A JSON request body is required."
            : "The request body is not valid JSON.",
        ],
      });
      return;
    }

    const result = await repositories.create(body.value);
    if (!result.ok) {
      sendFailure(res, result.code, result.details);
      return;
    }

    // 201 with Location is the conventional answer to a successful create: it
    // tells the client where the thing it just made now lives.
    res.setHeader("location", `/repositories/${result.value.id}`);
    sendJson(res, 201, result.value);
  }

  async function handleList(
    _req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const result = await repositories.list();
    if (!result.ok) {
      sendFailure(res, result.code, result.details);
      return;
    }

    // Wrapped rather than returned as a bare array so pagination can be added
    // beside the data later without changing the shape clients already parse.
    sendJson(res, 200, { data: result.value });
  }

  async function handleGet(
    _req: IncomingMessage,
    res: ServerResponse,
    params: RouteParams,
  ): Promise<void> {
    const result = await repositories.get(params.id ?? "");
    if (!result.ok) {
      sendFailure(res, result.code, result.details);
      return;
    }
    sendJson(res, 200, result.value);
  }

  async function handleDelete(
    _req: IncomingMessage,
    res: ServerResponse,
    params: RouteParams,
  ): Promise<void> {
    const result = await repositories.remove(params.id ?? "");
    if (!result.ok) {
      sendFailure(res, result.code, result.details);
      return;
    }

    // 204: it worked, and there is deliberately nothing to say about it.
    sendNoContent(res);
  }

  return [
    { method: "GET", path: "/health", handler: handleHealth },
    { method: "GET", path: "/ready", handler: ready },
    { method: "POST", path: "/repositories", handler: handleCreate },
    { method: "GET", path: "/repositories", handler: handleList },
    { method: "GET", path: "/repositories/:id", handler: handleGet },
    { method: "DELETE", path: "/repositories/:id", handler: handleDelete },
  ].map(({ method, path, handler }) => ({
    method,
    handler,
    segments: path.split("/").filter(Boolean),
  }));
}

/**
 * Finds the route matching this request and extracts any path parameters.
 *
 * A hand-written matcher is fine at five routes. The moment this needs
 * wildcards, precedence rules, or middleware, it is worth reaching for a
 * framework instead of growing this function — that is the trade a framework
 * actually buys you.
 */
function matchRoute(
  routes: Route[],
  method: string,
  pathname: string,
): { handler: Handler; params: RouteParams } | null {
  const segments = pathname.split("/").filter(Boolean);

  for (const route of routes) {
    if (route.method !== method || route.segments.length !== segments.length) {
      continue;
    }

    const params: RouteParams = {};
    const matched = route.segments.every((expected, index) => {
      const actual = segments[index] ?? "";
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        return true;
      }
      return expected === actual;
    });

    if (matched) {
      return { handler: route.handler, params };
    }
  }

  return null;
}

export interface AppDependencies {
  /** Injected so tests can supply isolated storage per app instance. */
  store: Store<TrackedRepository>;
  /**
   * Resolves when the service can do real work; throws when it cannot.
   * Wired to a database ping in production. Optional so the common case —
   * ready when the store works — needs no ceremony in tests.
   */
  checkReadiness?: () => Promise<void>;
}

export function createApp({ store, checkReadiness }: AppDependencies): Server {
  const routes = buildRoutes(
    createRepositories(store),
    buildReadyHandler(checkReadiness ?? (async () => {})),
  );

  return createServer((req, res) => {
    // The URL is parsed rather than compared directly so that a query string
    // does not turn /health into an unknown route.
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const match = matchRoute(routes, req.method ?? "", pathname);

    if (match === null) {
      handleNotFound(req, res);
      return;
    }

    // Handlers are async, and a rejected promise here would otherwise leave
    // the client waiting until it timed out rather than telling it anything.
    Promise.resolve(match.handler(req, res, match.params)).catch(
      (error: unknown) => {
        // A 500 nobody can see is a bug that never gets fixed. This is the
        // stand-in until the structured logger in #9 replaces it.
        // eslint-disable-next-line no-console
        console.error(error);

        if (!res.headersSent) {
          sendJson(res, 500, { error: "internal_error" });
        }
        res.end();
      },
    );
  });
}
