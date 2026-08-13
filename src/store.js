/**
 * In-memory storage.
 *
 * This module is the only place that knows how records are persisted. Swapping
 * in a database should replace this file rather than rippling through the
 * handlers, which is the point of putting it behind an interface at all.
 */

/**
 * Every method is async even though a Map answers instantly.
 *
 * The interface is shaped like the thing that will eventually sit behind it,
 * not like the thing behind it today. A database call is always asynchronous,
 * so if these were synchronous now, swapping one in later would mean editing
 * every caller — exactly the rewrite this indirection exists to prevent.
 */
export function createStore() {
  const rows = new Map();

  return {
    /**
     * Records are copied on the way in and out. Handing back a live reference
     * would let a caller mutate stored state by accident, which no real
     * database would permit and which is miserable to debug.
     */
    async insert(record) {
      rows.set(record.id, { ...record });
      return { ...record };
    },

    async findById(id) {
      const row = rows.get(id);
      return row === undefined ? null : { ...row };
    },

    async list() {
      return [...rows.values()].map((row) => ({ ...row }));
    },

    /** @returns {Promise<boolean>} whether a record was actually removed */
    async deleteById(id) {
      return rows.delete(id);
    },
  };
}
