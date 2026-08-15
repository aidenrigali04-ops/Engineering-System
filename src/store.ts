/**
 * The storage contract.
 *
 * This module defines the interface every persistence backend must satisfy,
 * not an implementation. Production runs on `src/pg-store.ts`; tests use the
 * in-memory double in `test/fake-store.ts`. Handlers depend only on the
 * interface here, which is the point of putting storage behind one at all.
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
 * Thrown by insert when a uniqueness rule in the storage layer is violated.
 *
 * Defined here, beside the Store interface, because it is part of the storage
 * contract rather than a detail of any one implementation: callers catch this
 * type without knowing which database produced it.
 */
export class UniqueViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniqueViolationError";
  }
}
