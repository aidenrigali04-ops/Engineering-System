/**
 * The Postgres implementation of the Store interface, satisfying the contract
 * src/store.ts promised: a database-backed store is a drop-in replacement.
 *
 * Uniqueness lives here as constraints, not as read-then-write checks. Two
 * concurrent inserts of the same repository cannot both succeed, because the
 * database serializes them — which no amount of pre-checking can guarantee.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import type { TrackedRepository } from "./repositories.ts";
import { UniqueViolationError, type Store } from "./store.ts";

/** Prisma's error code for a unique constraint violation. */
const UNIQUE_VIOLATION = "P2002";

function toDomain(row: {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  trackedAt: Date;
}): TrackedRepository {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    fullName: row.fullName,
    // The domain speaks ISO strings; Date objects are a storage detail.
    trackedAt: row.trackedAt.toISOString(),
  };
}

export function createPgRepositoryStore(
  prisma: PrismaClient,
): Store<TrackedRepository> {
  return {
    async insert(record: TrackedRepository): Promise<TrackedRepository> {
      try {
        const row = await prisma.repository.create({
          data: {
            id: record.id,
            owner: record.owner,
            name: record.name,
            fullName: record.fullName,
            fullNameLower: record.fullName.toLowerCase(),
            trackedAt: new Date(record.trackedAt),
          },
        });
        return toDomain(row);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          throw new UniqueViolationError(
            `A record conflicting with ${record.fullName} already exists.`,
          );
        }
        throw error;
      }
    },

    async findById(id: string): Promise<TrackedRepository | null> {
      const row = await prisma.repository.findUnique({ where: { id } });
      return row === null ? null : toDomain(row);
    },

    async list(): Promise<TrackedRepository[]> {
      const rows = await prisma.repository.findMany();
      return rows.map(toDomain);
    },

    async deleteById(id: string): Promise<boolean> {
      // deleteMany rather than delete: delete throws when the row is absent,
      // and absence is an answer here, not an error.
      const { count } = await prisma.repository.deleteMany({ where: { id } });
      return count > 0;
    },
  };
}
