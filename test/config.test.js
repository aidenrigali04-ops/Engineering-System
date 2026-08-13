import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PORT, resolvePort } from "../src/config.js";

describe("resolvePort", () => {
  describe("falls back to the default", () => {
    it("when PORT is absent", () => {
      assert.equal(resolvePort({}), DEFAULT_PORT);
    });

    it("when no environment is passed at all", () => {
      assert.equal(resolvePort(), DEFAULT_PORT);
    });

    it("when PORT is an empty string", () => {
      assert.equal(resolvePort({ PORT: "" }), DEFAULT_PORT);
    });

    it("when PORT is only whitespace", () => {
      assert.equal(resolvePort({ PORT: "   " }), DEFAULT_PORT);
    });
  });

  describe("accepts", () => {
    it("a normal port", () => {
      assert.equal(resolvePort({ PORT: "8080" }), 8080);
    });

    it("port 0, which asks the operating system for a free port", () => {
      assert.equal(resolvePort({ PORT: "0" }), 0);
    });

    it("the highest valid port", () => {
      assert.equal(resolvePort({ PORT: "65535" }), 65535);
    });
  });

  describe("rejects", () => {
    it("a port above the valid range", () => {
      assert.throws(
        () => resolvePort({ PORT: "65536" }),
        /between 0 and 65535/,
      );
    });

    it("a negative port", () => {
      assert.throws(() => resolvePort({ PORT: "-1" }), /between 0 and 65535/);
    });

    it("a non-numeric value", () => {
      assert.throws(() => resolvePort({ PORT: "http" }), /must be an integer/);
    });

    it("a value with a numeric prefix, rather than truncating it", () => {
      assert.throws(
        () => resolvePort({ PORT: "3000abc" }),
        /must be an integer/,
      );
    });

    it("a decimal", () => {
      assert.throws(
        () => resolvePort({ PORT: "3000.5" }),
        /must be an integer/,
      );
    });

    it("a hexadecimal literal, which Number would happily accept", () => {
      assert.throws(() => resolvePort({ PORT: "0x10" }), /must be an integer/);
    });
  });
});
