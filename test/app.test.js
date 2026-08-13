/**
 * Integration tests: these start the real server and make real HTTP requests.
 *
 * Unlike the unit tests, nothing here is stubbed. If routing, status codes, or
 * serialisation break, these fail — which the unit tests cannot detect.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";

/**
 * Port 0 asks the operating system for any free port. Hardcoding one makes
 * tests fail whenever something else happens to be using it, and makes two
 * test files unable to run at the same time.
 */
function listenOnEphemeralPort(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("HTTP API", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createApp();
    baseUrl = await listenOnEphemeralPort(server);
  });

  // Without this the process keeps an open handle and the test run hangs
  // instead of exiting.
  after(() => close(server));

  describe("GET /health", () => {
    it("responds 200", async () => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
    });

    it("responds with JSON", async () => {
      const response = await fetch(`${baseUrl}/health`);
      assert.match(response.headers.get("content-type"), /^application\/json/);
    });

    it("reports an ok status and a numeric uptime", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();

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
      const body = await response.json();

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

describe("server lifecycle", () => {
  it("releases its port when closed", async () => {
    const server = createApp();
    await listenOnEphemeralPort(server);
    assert.equal(server.listening, true);

    await close(server);
    assert.equal(server.listening, false);
  });
});
