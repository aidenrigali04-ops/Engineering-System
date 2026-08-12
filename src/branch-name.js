/**
 * Validates the branch naming convention documented in CONTRIBUTING.md:
 * `type/short-description`, for example `fix/null-check-on-empty-cart`.
 */

export const ALLOWED_TYPES = Object.freeze([
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "refactor",
  "test",
]);

export const MAX_LENGTH = 60;

// Lowercase alphanumeric words joined by single hyphens. Rejects leading and
// trailing hyphens, doubled hyphens, underscores, and uppercase.
const DESCRIPTION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(reason) {
  return { valid: false, reason };
}

/**
 * @param {unknown} name
 * @returns {{ valid: boolean, reason: string | null }}
 */
export function validateBranchName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    return invalid("A branch name is required.");
  }

  if (name.length > MAX_LENGTH) {
    return invalid(
      `A branch name must be ${MAX_LENGTH} characters or fewer, but this one is ${name.length}.`,
    );
  }

  const separators = name.split("/").length - 1;
  if (separators !== 1) {
    return invalid(
      'A branch name must look like "type/short-description", with exactly one slash.',
    );
  }

  const [type, description] = name.split("/");

  if (!ALLOWED_TYPES.includes(type)) {
    return invalid(
      `"${type}" is not a known type. Use one of: ${ALLOWED_TYPES.join(", ")}.`,
    );
  }

  if (!DESCRIPTION_PATTERN.test(description)) {
    return invalid(
      "The description must be lowercase words separated by single hyphens.",
    );
  }

  return { valid: true, reason: null };
}
