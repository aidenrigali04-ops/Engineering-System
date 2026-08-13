/**
 * Tracked repositories: the resource this service is built around.
 *
 * Registering a repository is what later gives webhook events somewhere to
 * attach to. Keeping this layer free of HTTP means it can be tested by calling
 * functions, and reused from a background job or a CLI without change.
 */

import { randomUUID } from "node:crypto";

/**
 * GitHub's own rules: up to 39 characters, alphanumeric or single hyphens,
 * never starting or ending with one. Validating against the real constraint
 * rather than a loose guess means bad input is refused here instead of
 * surfacing as a confusing 404 from GitHub much later.
 */
const OWNER_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const NAME_PATTERN = /^[\w.-]{1,100}$/;

const ALLOWED_FIELDS = Object.freeze(["owner", "name"]);

function failure(code, details) {
  return { ok: false, code, details };
}

function success(value) {
  return { ok: true, value };
}

/**
 * @returns {string[]} one message per problem, empty when the input is usable
 */
export function validateInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ["The request body must be a JSON object."];
  }

  const problems = [];

  // Unknown fields are rejected rather than ignored. Silently dropping a
  // misspelled field leaves the caller believing they set something they did
  // not, and that class of bug is invisible until it matters.
  for (const field of Object.keys(input)) {
    if (!ALLOWED_FIELDS.includes(field)) {
      problems.push(
        `"${field}" is not a recognised field. Expected: ${ALLOWED_FIELDS.join(", ")}.`,
      );
    }
  }

  for (const field of ALLOWED_FIELDS) {
    if (typeof input[field] !== "string" || input[field].trim() === "") {
      problems.push(`"${field}" is required and must be a non-empty string.`);
    }
  }

  if (typeof input.owner === "string" && !OWNER_PATTERN.test(input.owner)) {
    problems.push(
      '"owner" must be 1-39 characters of letters, digits, or single hyphens.',
    );
  }

  if (typeof input.name === "string") {
    if (!NAME_PATTERN.test(input.name)) {
      problems.push(
        '"name" must be 1-100 characters of letters, digits, hyphens, underscores, or dots.',
      );
    } else if (input.name === "." || input.name === "..") {
      problems.push('"name" cannot be "." or "..".');
    }
  }

  return problems;
}

export function createRepositories(store) {
  return {
    /**
     * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, details: string[]}>}
     */
    async create(input) {
      const problems = validateInput(input);
      if (problems.length > 0) {
        return failure("invalid", problems);
      }

      const fullName = `${input.owner}/${input.name}`;

      // A linear scan, which is fine for a Map and becomes a unique index the
      // moment this is a real table. Worth doing now so the behaviour is
      // settled before the storage changes underneath it.
      const existing = await store.list();
      if (
        existing.some(
          (row) => row.fullName.toLowerCase() === fullName.toLowerCase(),
        )
      ) {
        return failure("conflict", [`${fullName} is already tracked.`]);
      }

      return success(
        await store.insert({
          id: randomUUID(),
          owner: input.owner,
          name: input.name,
          fullName,
          trackedAt: new Date().toISOString(),
        }),
      );
    },

    async get(id) {
      const found = await store.findById(id);
      return found === null
        ? failure("not_found", [`No tracked repository with id ${id}.`])
        : success(found);
    },

    /** Newest first, so the list is stable and useful without a sort option. */
    async list() {
      const rows = await store.list();
      rows.sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
      return success(rows);
    },

    async remove(id) {
      const deleted = await store.deleteById(id);
      return deleted
        ? success(null)
        : failure("not_found", [`No tracked repository with id ${id}.`]);
    },
  };
}
