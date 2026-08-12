# Contributing

The rules below are enforced by GitHub, not by memory. `main` cannot be pushed to
directly; every change arrives through a pull request.

## Branch protection on `main`

| Rule | Effect |
| --- | --- |
| Pull request required | Direct pushes to `main` are rejected |
| Linear history required | Merge commits are refused; squash or rebase instead |
| Force pushes blocked | Published history cannot be rewritten |
| Deletions blocked | `main` cannot be deleted |
| Conversation resolution required | Every review comment must be resolved before merge |
| CI must pass | A pull request cannot merge while any check is failing |

The repository itself has merge commits disabled, leaving squash and rebase, and
deletes the remote branch automatically once a pull request merges.

Approvals are set to zero so solo work is not deadlocked. Raise this the moment a
second person joins the repository.

## The loop

Start from an up-to-date `main`:

```bash
git switch main
git pull
```

Create a branch named for the work, not for yourself:

```bash
git switch -c docs/contributing-workflow
```

Stage deliberately and review what you are about to commit:

```bash
git add -p
git diff --staged
git commit
```

Publish the branch and open a pull request:

```bash
git push -u origin HEAD
gh pr create --fill
```

After merge, delete the branch and return to `main`:

```bash
git switch main
git pull
git branch -d docs/contributing-workflow
```

## Continuous integration

Every pull request runs the checks in `.github/workflows/ci.yml`. They must pass
before the pull request can merge.

| Job | What it verifies |
| --- | --- |
| Test | The test suite passes under the Node version in `.nvmrc` |
| Lint and format | JavaScript lints, markdown lints, formatting is unchanged |
| Link check | Relative links point at files that actually exist |
| Branch name | The pull request's branch follows the convention below |

Run the same checks locally before pushing. CI is a safety net, not a test loop —
waiting on a runner to learn you have a lint error is a slow way to work.

```bash
npm ci          # once, or after the lockfile changes
npm run check   # everything CI runs
```

Formatting failures do not need to be fixed by hand:

```bash
npm run format
```

Tooling versions are pinned exactly in `package.json` and locked in
`package-lock.json`. CI installs with `npm ci`, which fails if the lockfile and
manifest disagree, so CI and your machine run identical tool versions.

When a check fails, open the failing job in the pull request's **Checks** tab and
read the step's log. Reproduce it locally, fix it, and push again; the run restarts
automatically.

## Branch naming

Use a `type/short-description` shape. This is enforced by the "Branch name" job,
which runs `src/branch-name.js` against the pull request's branch.

- `feat/user-login`
- `fix/null-check-on-empty-cart`
- `docs/contributing-workflow`
- `refactor/extract-http-client`
- `chore/bump-dependencies`
- `test/cover-empty-cart-path`
- `ci/cache-npm-downloads`

The type must be one of `chore`, `ci`, `docs`, `feat`, `fix`, `refactor`, or
`test`. The description must be lowercase words joined by single hyphens, and the
whole name must be 60 characters or fewer.

Check a name before you push:

```bash
node scripts/check-branch-name.js "$(git branch --show-current)"
```

## Commit messages

A summary line under about 50 characters, in the imperative mood, as if completing
the sentence "this commit will...". Then a blank line, then the *why* if it is not
obvious from the diff. The diff already shows what changed; it cannot explain the
reasoning.

```text
Reject empty cart at checkout

Empty carts reached the payment provider and failed with an opaque
error, which looked like an outage to users.
```

## Keeping a branch current

If `main` moves while you work, rebase to keep history linear:

```bash
git fetch origin
git rebase origin/main
```

Never force-push a branch someone else is working on. Rebasing your own unmerged
branch is fine, since a force-push after rebase only rewrites your own work.

## When a push is rejected

A rejected push means the remote has commits you do not. Integrate, do not force:

```bash
git pull --rebase
```

`git push --force` discards whatever you did not have locally. Reach for
`--force-with-lease` instead, which refuses to run if the remote moved unexpectedly.
