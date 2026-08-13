import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createStore, type Store } from "../src/store.ts";

interface Row {
  id: string;
  value?: number;
}

/**
 * Fetches a row that the test has already established exists.
 *
 * `assert.ok` is an assertion function, so this also narrows away the null
 * that `findById` can return, which is why the tests below can read `.value`
 * without a non-null assertion at every call site.
 */
async function requireById(store: Store<Row>, id: string): Promise<Row> {
  const row = await store.findById(id);
  assert.ok(row, `expected a row with id ${id}`);
  return row;
}

describe("createStore", () => {
  it("returns an empty list before anything is inserted", async () => {
    const store = createStore<Row>();
    assert.deepEqual(await store.list(), []);
  });

  it("returns the inserted record", async () => {
    const store = createStore<Row>();
    const inserted = await store.insert({ id: "a", value: 1 });

    assert.deepEqual(inserted, { id: "a", value: 1 });
    assert.deepEqual(await store.findById("a"), { id: "a", value: 1 });
  });

  it("returns null rather than undefined for an unknown id", async () => {
    const store = createStore<Row>();
    assert.equal(await store.findById("missing"), null);
  });

  it("lists every record", async () => {
    const store = createStore<Row>();
    await store.insert({ id: "a" });
    await store.insert({ id: "b" });

    assert.equal((await store.list()).length, 2);
  });

  it("overwrites a record inserted under an existing id", async () => {
    const store = createStore<Row>();
    await store.insert({ id: "a", value: 1 });
    await store.insert({ id: "a", value: 2 });

    assert.equal((await store.list()).length, 1);
    assert.equal((await requireById(store, "a")).value, 2);
  });

  describe("deleteById", () => {
    it("reports true when a record was removed", async () => {
      const store = createStore<Row>();
      await store.insert({ id: "a" });

      assert.equal(await store.deleteById("a"), true);
      assert.equal(await store.findById("a"), null);
    });

    it("reports false when there was nothing to remove", async () => {
      const store = createStore<Row>();
      assert.equal(await store.deleteById("missing"), false);
    });
  });

  // A real database hands back a copy of a row. Matching that here means code
  // written against this store keeps working once one is swapped in.
  describe("isolates stored state from callers", () => {
    it("copies on insert", async () => {
      const store = createStore<Row>();
      const input: Row = { id: "a", value: 1 };
      await store.insert(input);

      input.value = 99;

      assert.equal((await requireById(store, "a")).value, 1);
    });

    it("copies on read", async () => {
      const store = createStore<Row>();
      await store.insert({ id: "a", value: 1 });

      const found = await requireById(store, "a");
      found.value = 99;

      assert.equal((await requireById(store, "a")).value, 1);
    });

    it("copies on list", async () => {
      const store = createStore<Row>();
      await store.insert({ id: "a", value: 1 });

      const [row] = await store.list();
      assert.ok(row);
      row.value = 99;

      assert.equal((await requireById(store, "a")).value, 1);
    });
  });
});
