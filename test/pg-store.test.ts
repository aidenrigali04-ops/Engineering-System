import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPgRepositoryStore } from "../src/pg-store.ts";
import { UniqueViolationError, type Store } from "../src/store.ts";
import type { TrackedRepository } from "../src/repositories.ts";
import { createTestDb, type TestDb } from "./db.ts";

function repo(overrides: Partial<TrackedRepository> = {}): TrackedRepository {
  return {
    id: crypto.randomUUID(),
    owner: "octo",
    name: "widgets",
    fullName: "octo/widgets",
    trackedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("createPgRepositoryStore", () => {
  let db: TestDb;
  let store: Store<TrackedRepository>;

  before(async () => {
    db = await createTestDb();
    store = createPgRepositoryStore(db.prisma);
  });

  beforeEach(async () => {
    await db.prisma.repository.deleteMany();
  });

  after(() => db.destroy());

  it("returns an empty list before anything is inserted", async () => {
    assert.deepEqual(await store.list(), []);
  });

  it("round-trips a record through insert and findById", async () => {
    const record = repo();
    const inserted = await store.insert(record);

    assert.deepEqual(inserted, record);
    assert.deepEqual(await store.findById(record.id), record);
  });

  it("returns null rather than undefined for an unknown id", async () => {
    assert.equal(await store.findById("missing"), null);
  });

  it("lists every record", async () => {
    await store.insert(repo());
    await store.insert(repo({ owner: "other", fullName: "other/widgets" }));

    assert.equal((await store.list()).length, 2);
  });

  describe("deleteById", () => {
    it("reports true when a record was removed", async () => {
      const record = repo();
      await store.insert(record);

      assert.equal(await store.deleteById(record.id), true);
      assert.equal(await store.findById(record.id), null);
    });

    it("reports false when there was nothing to remove", async () => {
      assert.equal(await store.deleteById("missing"), false);
    });
  });

  describe("uniqueness", () => {
    it("rejects a duplicate full name, ignoring case", async () => {
      await store.insert(repo({ fullName: "octo/widgets" }));

      await assert.rejects(
        store.insert(repo({ fullName: "Octo/Widgets" })),
        UniqueViolationError,
      );
    });

    it("rejects a duplicate id", async () => {
      const record = repo();
      await store.insert(record);

      await assert.rejects(
        store.insert({ ...record, fullName: "octo/other" }),
        UniqueViolationError,
      );
    });
  });
});
