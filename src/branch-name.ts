/**
 * Validates the branch naming convention documented in CONTRIBUTING.md:
 * `type/short-description`, for example `fix/null-check-on-empty-cart`.
 */

export const ALLOWED_TYPES = [
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "refactor",
  "test",
] as const;

export type BranchType = (typeof ALLOWED_TYPES)[number];

export const MAX_LENGTH = 60;

// Lowercase alphanumeric words joined by single hyphens. Rejects leading and
// trailing hyphens, doubled hyphens, underscores, and uppercase.
const DESCRIPTION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ValidationResult {
  valid: boolean;
  reason: string | null;
}

function invalid(reason: string): ValidationResult {
  return { valid: false, reason };
}

export function validateBranchName(name: unknown): ValidationResult {
  if (typeof name !== "string" || name.trim() === "") {
    return invalid("A branch name is required.");
  }

  if (name.length > MAX_LENGTH) {
    return invalid(
      `A branch name must be ${MAX_LENGTH} characters or fewer, but this one is ${name.length}.`,
    );
  }

  const parts = name.split("/");
  if (parts.length !== 2) {
    return invalid(
      'A branch name must look like "type/short-description", with exactly one slash.',
    );
  }

  // Indexing is checked, so these are string | undefined until narrowed. The
  // length check above already guarantees both exist.
  const [type = "", description = ""] = parts;

  if (!ALLOWED_TYPES.includes(type as BranchType)) {
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
