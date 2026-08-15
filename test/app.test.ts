/**
 * Integration tests: these start the real server and make real HTTP requests.
 *
 * Unlike the unit tests, nothing here is stubbed. If routing, status codes, or
 * serialisation break, these fail — which the unit tests cannot detect.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "../src/app.ts";
import { createPgRepositoryStore } from "../src/pg-store.ts";
import type { TrackedRepository } from "../src/repositories.ts";
import { createTestDb, type TestDb } from "./db.ts";
import { createFakeStore } from "./fake-store.ts";

/**
 * Port 0 asks the operating system for any free port. Hardcoding one makes
 * tests fail whenever something else happens to be using it, and makes two
 * test files unable to run at the same time.
 */
function listenOnEphemeralPort(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

/**
 * `Response.json()` is typed as `any`, which would quietly disable type
 * checking for every assertion made against a response body. Naming the
 * expected shape here keeps that from spreading through the file.
 */
async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

interface ErrorBody {
  error: string;
  details?: string[];
}

// One database, and one running server, shared by every suite below. The
// point of these tests is to exercise real HTTP and real Postgres, not to pay
// for a fresh schema per describe block.
let db: TestDb;
let server: Server;
let baseUrl: string;

before(async () => {
  db = await createTestDb();
  server = createApp({ store: createPgRepositoryStore(db.prisma) });
  baseUrl = await listenOnEphemeralPort(server);
});

after(async () => {
  await close(server);
  await db.destroy();
});

describe("HTTP API", () => {
  describe("GET /health", () => {
    it("responds 200", async () => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
    });

    it("responds with JSON", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const contentType = response.headers.get("content-type");

      assert.ok(contentType, "should set a content-type");
      assert.match(contentType, /^application\/json/);
    });

    it("reports an ok status and a numeric uptime", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await readJson<{ status: string; uptime: number }>(response);

      assert.equal(body.status, "ok");
      assert.equal(typeof body.uptime, "number");
      assert.ok(body.uptime >= 0, "uptime should not be negative");
    });

    it("still routes correctly with a query string", async () => {
      const response = await fetch(`${baseUrl}/health?verbose=true`);
      assert.equal(response.status, 200);
    });
  });

  describe("unknown routes", () => {
    it("respond 404 for an unknown path", async () => {
      const response = await fetch(`${baseUrl}/does-not-exist`);
      assert.equal(response.status, 404);
    });

    it("respond 404 with the documented error shape", async () => {
      const response = await fetch(`${baseUrl}/does-not-exist`);
      const body = await readJson<ErrorBody>(response);

      assert.deepEqual(body, { error: "not_found" });
    });

    it("treat the method as part of the route", async () => {
      const response = await fetch(`${baseUrl}/health`, { method: "POST" });
      assert.equal(response.status, 404);
    });

    it("do not leak internals in the error body", async () => {
      const response = await fetch(`${baseUrl}/does-not-exist`);
      const body = await response.text();

      assert.doesNotMatch(
        body,
        /at .*\.js:\d+/,
        "should not contain a stack trace",
      );
    });
  });
});

describe("repositories API", () => {
  // State persists across tests within one server, so each test works on a
  // name no other test uses. Tests that depend on each other's leftovers pass
  // in order and fail the moment anything is reordered or run alone.
  let counter = 0;
  const uniqueInput = () => ({ owner: "octocat", name: `repo-${++counter}` });

  function post(body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/repositories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  /** Creates a repository and returns it, failing the test if that did not work. */
  async function create(): Promise<TrackedRepository> {
    const response = await post(uniqueInput());
    assert.equal(response.status, 201);
    return readJson<TrackedRepository>(response);
  }

  function list(): Promise<{ data: TrackedRepository[] }> {
    return fetch(`${baseUrl}/repositories`).then((response) =>
      readJson<{ data: TrackedRepository[] }>(response),
    );
  }

  describe("creating", () => {
    it("responds 201 with the created repository", async () => {
      const input = uniqueInput();
      const response = await post(input);
      const body = await readJson<TrackedRepository>(response);

      assert.equal(response.status, 201);
      assert.equal(body.owner, input.owner);
      assert.equal(body.name, input.name);
      assert.equal(body.fullName, `${input.owner}/${input.name}`);
      assert.ok(body.id, "should assign an id");
    });

    it("points at the new repository with a Location header", async () => {
      const response = await post(uniqueInput());
      const body = await readJson<TrackedRepository>(response);

      assert.equal(
        response.headers.get("location"),
        `/repositories/${body.id}`,
      );
    });

    it("makes the repository fetchable at that location", async () => {
      const created = await create();
      const response = await fetch(`${baseUrl}/repositories/${created.id}`);

      assert.equal(response.status, 200);
      assert.deepEqual(await readJson<TrackedRepository>(response), created);
    });

    it("includes it in the list", async () => {
      const created = await create();
      const { data } = await list();

      assert.ok(data.some((row) => row.id === created.id));
    });
  });

  describe("rejecting bad input", () => {
    it("responds 400 with details when a field is missing", async () => {
      const response = await post({ owner: "octocat" });
      const body = await readJson<ErrorBody>(response);

      assert.equal(response.status, 400);
      assert.equal(body.error, "invalid");
      assert.ok(body.details?.length, "should say what was wrong");
    });

    it("responds 400 for a malformed JSON body", async () => {
      const response = await post("{not json");
      const body = await readJson<ErrorBody>(response);

      assert.equal(response.status, 400);
      assert.match(body.details?.[0] ?? "", /not valid JSON/);
    });

    it("responds 400 for an empty body", async () => {
      const response = await post("");
      assert.equal(response.status, 400);
    });

    it("responds 400 for a JSON value that is not an object", async () => {
      const response = await post('"just a string"');
      assert.equal(response.status, 400);
    });

    it("responds 413 rather than reading an oversized body", async () => {
      const response = await post({
        owner: "octocat",
        name: "x".repeat(32 * 1024),
      });

      assert.equal(response.status, 413);
    });

    it("responds 409 when the repository is already tracked", async () => {
      const input = uniqueInput();
      await post(input);
      const response = await post(input);

      assert.equal(response.status, 409);
      assert.equal((await readJson<ErrorBody>(response)).error, "conflict");
    });
  });

  describe("fetching one", () => {
    it("responds 404 for an id that does not exist", async () => {
      const response = await fetch(`${baseUrl}/repositories/nope`);
      const body = await readJson<ErrorBody>(response);

      assert.equal(response.status, 404);
      assert.equal(body.error, "not_found");
    });
  });

  describe("deleting", () => {
    it("responds 204 with no body", async () => {
      const created = await create();
      const response = await fetch(`${baseUrl}/repositories/${created.id}`, {
        method: "DELETE",
      });

      assert.equal(response.status, 204);
      assert.equal(await response.text(), "");
    });

    it("actually removes it", async () => {
      const created = await create();
      await fetch(`${baseUrl}/repositories/${created.id}`, {
        method: "DELETE",
      });

      const response = await fetch(`${baseUrl}/repositories/${created.id}`);
      assert.equal(response.status, 404);
    });

    it("responds 404 when deleting something already gone", async () => {
      const created = await create();
      const url = `${baseUrl}/repositories/${created.id}`;

      assert.equal((await fetch(url, { method: "DELETE" })).status, 204);
      assert.equal((await fetch(url, { method: "DELETE" })).status, 404);
    });
  });

  describe("isolation between app instances", () => {
    it("does not share storage with another app", async () => {
      // A fake store here, not another Postgres-backed one: two apps pointed
      // at the same database are *supposed* to share data — that is the
      // entire point of persistence. What this guards against is app.ts
      // ignoring the store it was given in favour of some shared state of
      // its own.
      const other = createApp({ store: createFakeStore<TrackedRepository>() });
      const otherUrl = await listenOnEphemeralPort(other);

      try {
        await post(uniqueInput());
        const otherResponse = await fetch(`${otherUrl}/repositories`);
        const { data } = await readJson<{ data: TrackedRepository[] }>(
          otherResponse,
        );

        assert.deepEqual(data, [], "a second app should start empty");
      } finally {
        await close(other);
      }
    });
  });
});

describe("GET /ready", () => {
  it("responds 200 when the database answers", async () => {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await readJson(response), { status: "ready" });
  });

  it("responds 503 when the readiness check fails", async () => {
    const failing = createApp({
      store: createPgRepositoryStore(db.prisma),
      checkReadiness: async () => {
        throw new Error("database unreachable");
      },
    });
    const failingUrl = await listenOnEphemeralPort(failing);

    const response = await fetch(`${failingUrl}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await readJson(response), { status: "unavailable" });

    await close(failing);
  });
});

describe("server lifecycle", () => {
  it("releases its port when closed", async () => {
    const server = createApp({ store: createFakeStore<TrackedRepository>() });
    await listenOnEphemeralPort(server);
    assert.equal(server.listening, true);

    await close(server);
    assert.equal(server.listening, false);
  });
});
