/**
 * Fails with a non-zero exit code when the given branch name does not follow
 * the convention in CONTRIBUTING.md. Run by the "Branch name" job in CI.
 *
 * Usage: node scripts/check-branch-name.ts <branch-name>
 */

import { validateBranchName } from "../src/branch-name.ts";

const name = process.argv[2];
const { valid, reason } = validateBranchName(name);

if (!valid) {
  console.error(`Invalid branch name: ${JSON.stringify(name)}`);
  console.error(reason);
  console.error("See CONTRIBUTING.md for the naming convention.");
  process.exit(1);
}

console.log(`Branch name ${JSON.stringify(name)} follows the convention.`);
