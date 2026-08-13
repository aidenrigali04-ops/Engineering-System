/**
 * In-memory storage.
 *
 * This module is the only place that knows how records are persisted. Swapping
 * in a database should replace this file rather than rippling through the
 * handlers, which is the point of putting it behind an interface at all.
 */

/** The minimum a record must have for the store to address it. */
export interface Identified {
  id: string;
}

/**
 * Written as an interface rather than inferred from the implementation, so a
 * second implementation has something to conform to. A database-backed store
 * satisfying this type is, by construction, a drop-in replacement.
 */
export interface Store<T extends Identified> {
  insert(record: T): Promise<T>;
  findById(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  /** @returns whether a record was actually removed */
  deleteById(id: string): Promise<boolean>;
}

/**
 * Every method is async even though a Map answers instantly.
 *
 * The interface is shaped like the thing that will eventually sit behind it,
 * not like the thing behind it today. A database call is always asynchronous,
 * so if these were synchronous now, swapping one in later would mean editing
 * every caller — exactly the rewrite this indirection exists to prevent.
 */
export function createStore<T extends Identified>(): Store<T> {
  const rows = new Map<string, T>();

  return {
    /**
     * Records are copied on the way in and out. Handing back a live reference
     * would let a caller mutate stored state by accident, which no real
     * database would permit and which is miserable to debug.
     */
    async insert(record: T): Promise<T> {
      rows.set(record.id, { ...record });
      return { ...record };
    },

    async findById(id: string): Promise<T | null> {
      const row = rows.get(id);
      return row === undefined ? null : { ...row };
    },

    async list(): Promise<T[]> {
      return [...rows.values()].map((row) => ({ ...row }));
    },

    async deleteById(id: string): Promise<boolean> {
      return rows.delete(id);
    },
  };
}
