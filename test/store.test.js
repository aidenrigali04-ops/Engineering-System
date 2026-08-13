import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/store.js";

describe("createStore", () => {
  it("returns an empty list before anything is inserted", async () => {
    const store = createStore();
    assert.deepEqual(await store.list(), []);
  });

  it("returns the inserted record", async () => {
    const store = createStore();
    const inserted = await store.insert({ id: "a", value: 1 });

    assert.deepEqual(inserted, { id: "a", value: 1 });
    assert.deepEqual(await store.findById("a"), { id: "a", value: 1 });
  });

  it("returns null rather than undefined for an unknown id", async () => {
    const store = createStore();
    assert.equal(await store.findById("missing"), null);
  });

  it("lists every record", async () => {
    const store = createStore();
    await store.insert({ id: "a" });
    await store.insert({ id: "b" });

    assert.equal((await store.list()).length, 2);
  });

  it("overwrites a record inserted under an existing id", async () => {
    const store = createStore();
    await store.insert({ id: "a", value: 1 });
    await store.insert({ id: "a", value: 2 });

    assert.equal((await store.list()).length, 1);
    assert.equal((await store.findById("a")).value, 2);
  });

  describe("deleteById", () => {
    it("reports true when a record was removed", async () => {
      const store = createStore();
      await store.insert({ id: "a" });

      assert.equal(await store.deleteById("a"), true);
      assert.equal(await store.findById("a"), null);
    });

    it("reports false when there was nothing to remove", async () => {
      const store = createStore();
      assert.equal(await store.deleteById("missing"), false);
    });
  });

  // A real database hands back a copy of a row. Matching that here means code
  // written against this store keeps working once one is swapped in.
  describe("isolates stored state from callers", () => {
    it("copies on insert", async () => {
      const store = createStore();
      const input = { id: "a", value: 1 };
      await store.insert(input);

      input.value = 99;

      assert.equal((await store.findById("a")).value, 1);
    });

    it("copies on read", async () => {
      const store = createStore();
      await store.insert({ id: "a", value: 1 });

      const found = await store.findById("a");
      found.value = 99;

      assert.equal((await store.findById("a")).value, 1);
    });

    it("copies on list", async () => {
      const store = createStore();
      await store.insert({ id: "a", value: 1 });

      const [row] = await store.list();
      row.value = 99;

      assert.equal((await store.findById("a")).value, 1);
    });
  });
});
