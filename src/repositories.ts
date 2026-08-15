/**
 * Tracked repositories: the resource this service is built around.
 *
 * Registering a repository is what later gives webhook events somewhere to
 * attach to. Keeping this layer free of HTTP means it can be tested by calling
 * functions, and reused from a background job or a CLI without change.
 */

import { randomUUID } from "node:crypto";

import { UniqueViolationError, type Identified, type Store } from "./store.ts";

export interface TrackedRepository extends Identified {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  /** ISO 8601, so it sorts lexicographically and survives JSON intact. */
  trackedAt: string;
}

export interface RepositoryInput {
  owner: string;
  name: string;
}

export type FailureCode = "invalid" | "not_found" | "conflict";

/**
 * Failures are returned, not thrown. Every one of these is something a client
 * will routinely do, so none of them are exceptional, and a return type forces
 * the caller to deal with the possibility instead of forgetting a catch.
 */
export type Result<T> =
  { ok: true; value: T } | { ok: false; code: FailureCode; details: string[] };

export interface Repositories {
  create(input: unknown): Promise<Result<TrackedRepository>>;
  get(id: string): Promise<Result<TrackedRepository>>;
  list(): Promise<Result<TrackedRepository[]>>;
  remove(id: string): Promise<Result<null>>;
}

/**
 * GitHub's own rules: up to 39 characters, alphanumeric or single hyphens,
 * never starting or ending with one. Validating against the real constraint
 * rather than a loose guess means bad input is refused here instead of
 * surfacing as a confusing 404 from GitHub much later.
 */
const OWNER_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const NAME_PATTERN = /^[\w.-]{1,100}$/;

const ALLOWED_FIELDS = ["owner", "name"] as const;

function failure(code: FailureCode, details: string[]): Result<never> {
  return { ok: false, code, details };
}

function success<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * @returns one message per problem, empty when the input is usable
 */
export function validateInput(input: unknown): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ["The request body must be a JSON object."];
  }

  const candidate = input as Record<string, unknown>;
  const problems: string[] = [];

  // Unknown fields are rejected rather than ignored. Silently dropping a
  // misspelled field leaves the caller believing they set something they did
  // not, and that class of bug is invisible until it matters.
  for (const field of Object.keys(candidate)) {
    if (!ALLOWED_FIELDS.includes(field as (typeof ALLOWED_FIELDS)[number])) {
      problems.push(
        `"${field}" is not a recognised field. Expected: ${ALLOWED_FIELDS.join(", ")}.`,
      );
    }
  }

  for (const field of ALLOWED_FIELDS) {
    const value = candidate[field];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`"${field}" is required and must be a non-empty string.`);
    }
  }

  const { owner, name } = candidate;

  if (typeof owner === "string" && !OWNER_PATTERN.test(owner)) {
    problems.push(
      '"owner" must be 1-39 characters of letters, digits, or single hyphens.',
    );
  }

  if (typeof name === "string") {
    if (!NAME_PATTERN.test(name)) {
      problems.push(
        '"name" must be 1-100 characters of letters, digits, hyphens, underscores, or dots.',
      );
    } else if (name === "." || name === "..") {
      problems.push('"name" cannot be "." or "..".');
    }
  }

  return problems;
}

export function createRepositories(
  store: Store<TrackedRepository>,
): Repositories {
  return {
    async create(input: unknown): Promise<Result<TrackedRepository>> {
      const problems = validateInput(input);
      if (problems.length > 0) {
        return failure("invalid", problems);
      }

      // Validation has established the shape, which the type system cannot
      // infer from a runtime check spread across another function.
      const { owner, name } = input as RepositoryInput;
      const fullName = `${owner}/${name}`;

      // Uniqueness is the store's job, enforced by a constraint the database
      // checks atomically. The scan this replaces had a race window: two
      // concurrent creates could both pass the check and both insert.
      try {
        return success(
          await store.insert({
            id: randomUUID(),
            owner,
            name,
            fullName,
            trackedAt: new Date().toISOString(),
          }),
        );
      } catch (error) {
        if (error instanceof UniqueViolationError) {
          return failure("conflict", [`${fullName} is already tracked.`]);
        }
        throw error;
      }
    },

    async get(id: string): Promise<Result<TrackedRepository>> {
      const found = await store.findById(id);
      return found === null
        ? failure("not_found", [`No tracked repository with id ${id}.`])
        : success(found);
    },

    /** Newest first, so the list is stable and useful without a sort option. */
    async list(): Promise<Result<TrackedRepository[]>> {
      const rows = await store.list();
      rows.sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
      return success(rows);
    },

    async remove(id: string): Promise<Result<null>> {
      const deleted = await store.deleteById(id);
      return deleted
        ? success(null)
        : failure("not_found", [`No tracked repository with id ${id}.`]);
    },
  };
}
