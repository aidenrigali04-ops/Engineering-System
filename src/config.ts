/**
 * Reads runtime configuration from the environment.
 *
 * Kept as a pure function of an env object rather than reading `process.env`
 * directly, so it can be tested without mutating global state.
 */

export const DEFAULT_PORT = 3000;

/**
 * Port 0 is meaningful: it asks the operating system for any free port, which
 * is what tests use to avoid colliding with a real server.
 */
const MIN_PORT = 0;
const MAX_PORT = 65535;

export type Environment = Record<string, string | undefined>;

/**
 * @throws {Error} when PORT is set but is not a usable port number
 */
export function resolvePort(env: Environment = {}): number {
  const raw = env.PORT;

  if (raw === undefined) {
    return DEFAULT_PORT;
  }

  const trimmed = raw.trim();

  if (trimmed === "") {
    return DEFAULT_PORT;
  }

  // Matched against digits rather than passed to Number() or parseInt, both of
  // which accept things a port is not: Number("0x10") is 16, Number("  ") is 0,
  // and parseInt("3000abc") is 3000. Any of those would start the server
  // somewhere the operator did not ask for.
  const parsed = Number(trimmed);
  const invalid =
    !/^\d+$/.test(trimmed) || parsed < MIN_PORT || parsed > MAX_PORT;

  if (invalid) {
    throw new Error(
      `PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, but was ${JSON.stringify(raw)}.`,
    );
  }

  return parsed;
}
