/**
 * The in-memory store, now living where it belongs: in the test suite.
 *
 * Production always runs on Postgres. This double exists so domain logic can
 * be unit-tested without a database, and it models the same contract the real
 * store enforces — including uniqueness — so tests written against it keep
 * meaning something.
 */

import {
  UniqueViolationError,
  type Identified,
  type Store,
} from "../src/store.ts";

export interface FakeStoreOptions<T> {
  /** Derives the value that must be unique across rows, e.g. a lowercased
   *  full name. Omit it and only ids must be unique. */
  uniqueBy?: (row: T) => string;
}

export function createFakeStore<T extends Identified>(
  options: FakeStoreOptions<T> = {},
): Store<T> {
  const rows = new Map<string, T>();

  return {
    async insert(record: T): Promise<T> {
      if (rows.has(record.id)) {
        throw new UniqueViolationError(`Duplicate id ${record.id}.`);
      }
      if (options.uniqueBy) {
        const key = options.uniqueBy(record);
        for (const row of rows.values()) {
          if (options.uniqueBy(row) === key) {
            throw new UniqueViolationError(`Duplicate key ${key}.`);
          }
        }
      }
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
