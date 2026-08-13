import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createRepositories, validateInput } from "../src/repositories.js";
import { createStore } from "../src/store.js";

/** A fresh store per test, so no test can be affected by another's state. */
function subject() {
  const store = createStore();
  return { store, repositories: createRepositories(store) };
}

const VALID = { owner: "aidenrigali04-ops", name: "Engineering-System" };

describe("validateInput", () => {
  it("accepts a well-formed body", () => {
    assert.deepEqual(validateInput(VALID), []);
  });

  it("accepts names containing dots, hyphens, and underscores", () => {
    assert.deepEqual(validateInput({ owner: "octocat", name: "a.b-c_d" }), []);
  });

  describe("rejects", () => {
    for (const [label, value] of [
      ["null", null],
      ["a string", "owner=octocat"],
      ["an array", [VALID]],
      ["a number", 7],
    ]) {
      it(`${label} as the whole body`, () => {
        const problems = validateInput(value);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /must be a JSON object/);
      });
    }

    it("a missing owner", () => {
      const problems = validateInput({ name: "repo" });
      assert.ok(problems.some((p) => p.includes('"owner" is required')));
    });

    it("a missing name", () => {
      const problems = validateInput({ owner: "octocat" });
      assert.ok(problems.some((p) => p.includes('"name" is required')));
    });

    it("an empty or whitespace-only value", () => {
      assert.ok(validateInput({ owner: "", name: "repo" }).length > 0);
      assert.ok(validateInput({ owner: "   ", name: "repo" }).length > 0);
    });

    it("a non-string value", () => {
      assert.ok(validateInput({ owner: 42, name: "repo" }).length > 0);
      assert.ok(validateInput({ owner: "octocat", name: null }).length > 0);
    });

    it("an unknown field, rather than silently ignoring it", () => {
      const problems = validateInput({ ...VALID, isPrivate: true });
      assert.ok(problems.some((p) => p.includes("not a recognised field")));
    });

    it("an owner with a leading or trailing hyphen", () => {
      assert.ok(validateInput({ owner: "-octocat", name: "r" }).length > 0);
      assert.ok(validateInput({ owner: "octocat-", name: "r" }).length > 0);
    });

    it("an owner with consecutive hyphens", () => {
      assert.ok(validateInput({ owner: "octo--cat", name: "r" }).length > 0);
    });

    it("an owner over 39 characters", () => {
      assert.ok(validateInput({ owner: "a".repeat(40), name: "r" }).length > 0);
    });

    it("an owner containing a slash, which would forge a full name", () => {
      assert.ok(validateInput({ owner: "a/b", name: "r" }).length > 0);
    });

    it("a name over 100 characters", () => {
      assert.ok(
        validateInput({ owner: "octocat", name: "a".repeat(101) }).length > 0,
      );
    });

    it('a name of "." or ".."', () => {
      assert.ok(validateInput({ owner: "octocat", name: "." }).length > 0);
      assert.ok(validateInput({ owner: "octocat", name: ".." }).length > 0);
    });

    it("reports every problem at once, not just the first", () => {
      const problems = validateInput({ owner: "", name: "" });
      assert.ok(problems.length >= 2);
    });
  });
});

describe("repositories.create", () => {
  it("stores the repository and returns it", async () => {
    const { repositories } = subject();
    const result = await repositories.create(VALID);

    assert.equal(result.ok, true);
    assert.equal(result.value.owner, VALID.owner);
    assert.equal(result.value.name, VALID.name);
  });

  it("derives a full name", async () => {
    const { repositories } = subject();
    const { value } = await repositories.create(VALID);

    assert.equal(value.fullName, "aidenrigali04-ops/Engineering-System");
  });

  it("assigns an id the caller did not choose", async () => {
    const { repositories } = subject();
    const first = await repositories.create(VALID);
    const second = await repositories.create({ owner: "octocat", name: "b" });

    assert.match(first.value.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(first.value.id, second.value.id);
  });

  it("records when tracking started, as an ISO timestamp", async () => {
    const { repositories } = subject();
    const { value } = await repositories.create(VALID);

    assert.equal(value.trackedAt, new Date(value.trackedAt).toISOString());
  });

  it("rejects invalid input without storing anything", async () => {
    const { repositories, store } = subject();
    const result = await repositories.create({ owner: "" });

    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid");
    assert.deepEqual(await store.list(), []);
  });

  describe("duplicates", () => {
    it("are refused", async () => {
      const { repositories } = subject();
      await repositories.create(VALID);
      const result = await repositories.create(VALID);

      assert.equal(result.ok, false);
      assert.equal(result.code, "conflict");
    });

    // GitHub treats owner/name case-insensitively, so tracking the same
    // repository twice under different capitalisation is still a duplicate.
    it("are refused regardless of capitalisation", async () => {
      const { repositories } = subject();
      await repositories.create({ owner: "octocat", name: "Hello" });
      const result = await repositories.create({
        owner: "OctoCat",
        name: "hello",
      });

      assert.equal(result.code, "conflict");
    });

    it("leave the original untouched", async () => {
      const { repositories, store } = subject();
      await repositories.create(VALID);
      await repositories.create(VALID);

      assert.equal((await store.list()).length, 1);
    });
  });
});

describe("repositories.get", () => {
  it("returns a stored repository", async () => {
    const { repositories } = subject();
    const created = await repositories.create(VALID);
    const found = await repositories.get(created.value.id);

    assert.equal(found.ok, true);
    assert.deepEqual(found.value, created.value);
  });

  it("reports not_found for an unknown id", async () => {
    const { repositories } = subject();
    const result = await repositories.get("does-not-exist");

    assert.equal(result.ok, false);
    assert.equal(result.code, "not_found");
  });
});

describe("repositories.list", () => {
  it("is empty to begin with", async () => {
    const { repositories } = subject();
    assert.deepEqual((await repositories.list()).value, []);
  });

  it("returns the newest first", async () => {
    const { store, repositories } = subject();

    // Written straight to the store so the timestamps are controlled. Two
    // creates in the same millisecond would make this assertion a coin flip.
    await store.insert({
      id: "1",
      fullName: "a/older",
      trackedAt: "2020-01-01T00:00:00.000Z",
    });
    await store.insert({
      id: "2",
      fullName: "a/newer",
      trackedAt: "2024-01-01T00:00:00.000Z",
    });

    const { value } = await repositories.list();
    assert.deepEqual(
      value.map((row) => row.fullName),
      ["a/newer", "a/older"],
    );
  });
});

describe("repositories.remove", () => {
  it("deletes a stored repository", async () => {
    const { repositories, store } = subject();
    const created = await repositories.create(VALID);

    const result = await repositories.remove(created.value.id);

    assert.equal(result.ok, true);
    assert.deepEqual(await store.list(), []);
  });

  it("reports not_found for an unknown id", async () => {
    const { repositories } = subject();
    const result = await repositories.remove("does-not-exist");

    assert.equal(result.ok, false);
    assert.equal(result.code, "not_found");
  });

  it("frees the name for reuse", async () => {
    const { repositories } = subject();
    const created = await repositories.create(VALID);
    await repositories.remove(created.value.id);

    assert.equal((await repositories.create(VALID)).ok, true);
  });
});
