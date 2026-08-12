import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_TYPES,
  MAX_LENGTH,
  validateBranchName,
} from "../src/branch-name.js";

describe("validateBranchName", () => {
  describe("accepts", () => {
    for (const type of ALLOWED_TYPES) {
      it(`the "${type}" type`, () => {
        const result = validateBranchName(`${type}/some-description`);
        assert.equal(result.valid, true);
        assert.equal(result.reason, null);
      });
    }

    it("a single-word description", () => {
      assert.equal(validateBranchName("fix/typo").valid, true);
    });

    it("digits inside the description", () => {
      assert.equal(validateBranchName("fix/http2-timeout").valid, true);
    });

    it("a name exactly at the length limit", () => {
      const name = `feat/${"a".repeat(MAX_LENGTH - "feat/".length)}`;
      assert.equal(name.length, MAX_LENGTH);
      assert.equal(validateBranchName(name).valid, true);
    });
  });

  describe("rejects", () => {
    it("an empty string", () => {
      const result = validateBranchName("");
      assert.equal(result.valid, false);
      assert.match(result.reason, /required/);
    });

    it("whitespace only", () => {
      assert.equal(validateBranchName("   ").valid, false);
    });

    it("a non-string value", () => {
      assert.equal(validateBranchName(undefined).valid, false);
      assert.equal(validateBranchName(null).valid, false);
      assert.equal(validateBranchName(42).valid, false);
    });

    it("a name with no slash", () => {
      const result = validateBranchName("just-a-description");
      assert.equal(result.valid, false);
      assert.match(result.reason, /exactly one slash/);
    });

    it("a name with more than one slash", () => {
      assert.equal(validateBranchName("feat/nested/description").valid, false);
    });

    it("an unknown type", () => {
      const result = validateBranchName("wip/some-description");
      assert.equal(result.valid, false);
      assert.match(result.reason, /not a known type/);
    });

    it("an uppercase type", () => {
      assert.equal(validateBranchName("FEAT/some-description").valid, false);
    });

    it("an uppercase description", () => {
      const result = validateBranchName("feat/Some-Description");
      assert.equal(result.valid, false);
      assert.match(result.reason, /lowercase/);
    });

    it("underscores in the description", () => {
      assert.equal(validateBranchName("feat/some_description").valid, false);
    });

    it("a leading or trailing hyphen", () => {
      assert.equal(validateBranchName("feat/-leading").valid, false);
      assert.equal(validateBranchName("feat/trailing-").valid, false);
    });

    it("doubled hyphens", () => {
      assert.equal(validateBranchName("feat/double--hyphen").valid, false);
    });

    it("an empty description", () => {
      assert.equal(validateBranchName("feat/").valid, false);
    });

    it("a name one character over the length limit", () => {
      const name = `feat/${"a".repeat(MAX_LENGTH - "feat/".length + 1)}`;
      const result = validateBranchName(name);
      assert.equal(result.valid, false);
      assert.match(result.reason, /characters or fewer/);
    });
  });
});
