import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createRepositories,
  validateInput,
  type Repositories,
  type TrackedRepository,
} from "../src/repositories.ts";
import { createStore, type Store } from "../src/store.ts";

/** A fresh store per test, so no test can be affected by another's state. */
function subject(): {
  store: Store<TrackedRepository>;
  repositories: Repositories;
} {
  const store = createStore<TrackedRepository>();
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
    const notObjects: Array<[string, unknown]> = [
      ["null", null],
      ["a string", "owner=octocat"],
      ["an array", [VALID]],
      ["a number", 7],
    ];

    for (const [label, value] of notObjects) {
      it(`${label} as the whole body`, () => {
        const problems = validateInput(value);
        assert.equal(problems.length, 1);
        assert.match(problems[0] ?? "", /must be a JSON object/);
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
      const problems = validateInput({
        owner: "octocat",
        name: "a".repeat(101),
      });
      assert.ok(problems.length > 0);
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

    // assert.ok narrows the result union, so `result.value` below is typed as
    // a repository rather than as possibly-absent.
    assert.ok(result.ok);
    assert.equal(result.value.owner, VALID.owner);
    assert.equal(result.value.name, VALID.name);
  });

  it("derives a full name", async () => {
    const { repositories } = subject();
    const result = await repositories.create(VALID);

    assert.ok(result.ok);
    assert.equal(result.value.fullName, "aidenrigali04-ops/Engineering-System");
  });

  it("assigns an id the caller did not choose", async () => {
    const { repositories } = subject();
    const first = await repositories.create(VALID);
    const second = await repositories.create({ owner: "octocat", name: "b" });

    assert.ok(first.ok);
    assert.ok(second.ok);
    assert.match(first.value.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(first.value.id, second.value.id);
  });

  it("records when tracking started, as an ISO timestamp", async () => {
    const { repositories } = subject();
    const result = await repositories.create(VALID);

    assert.ok(result.ok);
    const { trackedAt } = result.value;
    assert.equal(trackedAt, new Date(trackedAt).toISOString());
  });

  it("rejects invalid input without storing anything", async () => {
    const { repositories, store } = subject();
    const result = await repositories.create({ owner: "" });

    assert.ok(!result.ok);
    assert.equal(result.code, "invalid");
    assert.deepEqual(await store.list(), []);
  });

  describe("duplicates", () => {
    it("are refused", async () => {
      const { repositories } = subject();
      await repositories.create(VALID);
      const result = await repositories.create(VALID);

      assert.ok(!result.ok);
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

      assert.ok(!result.ok);
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
    assert.ok(created.ok);

    const found = await repositories.get(created.value.id);
    assert.ok(found.ok);
    assert.deepEqual(found.value, created.value);
  });

  it("reports not_found for an unknown id", async () => {
    const { repositories } = subject();
    const result = await repositories.get("does-not-exist");

    assert.ok(!result.ok);
    assert.equal(result.code, "not_found");
  });
});

describe("repositories.list", () => {
  it("is empty to begin with", async () => {
    const { repositories } = subject();
    const result = await repositories.list();

    assert.ok(result.ok);
    assert.deepEqual(result.value, []);
  });

  it("returns the newest first", async () => {
    const { store, repositories } = subject();

    // Written straight to the store so the timestamps are controlled. Two
    // creates in the same millisecond would make this assertion a coin flip.
    await store.insert({
      id: "1",
      owner: "a",
      name: "older",
      fullName: "a/older",
      trackedAt: "2020-01-01T00:00:00.000Z",
    });
    await store.insert({
      id: "2",
      owner: "a",
      name: "newer",
      fullName: "a/newer",
      trackedAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await repositories.list();
    assert.ok(result.ok);
    assert.deepEqual(
      result.value.map((row) => row.fullName),
      ["a/newer", "a/older"],
    );
  });
});

describe("repositories.remove", () => {
  it("deletes a stored repository", async () => {
    const { repositories, store } = subject();
    const created = await repositories.create(VALID);
    assert.ok(created.ok);

    const result = await repositories.remove(created.value.id);

    assert.ok(result.ok);
    assert.deepEqual(await store.list(), []);
  });

  it("reports not_found for an unknown id", async () => {
    const { repositories } = subject();
    const result = await repositories.remove("does-not-exist");

    assert.ok(!result.ok);
    assert.equal(result.code, "not_found");
  });

  it("frees the name for reuse", async () => {
    const { repositories } = subject();
    const created = await repositories.create(VALID);
    assert.ok(created.ok);
    await repositories.remove(created.value.id);

    const recreated = await repositories.create(VALID);
    assert.ok(recreated.ok);
  });
});
