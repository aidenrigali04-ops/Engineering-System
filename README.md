# Engineering System

A learning playground for practicing the tools and workflows used in professional
software engineering: version control, code review, automated checks, and release
process.

The goal here is deliberate practice with the *process*, not shipping a product.
Features exist only as excuses to exercise the tooling.

## Status

Bootstrapping. `main` is protected, changes land through pull requests, and CI
runs tests, linting, and formatting on every one. The only source code so far is
a small module that enforces this repository's own branch naming convention.

## Repository layout

```text
.
├── .cursor/                    Editor configuration shared with the repo
├── .github/workflows/ci.yml    Checks that run on every pull request
├── .gitignore                  Files git should never track
├── .markdownlint-cli2.jsonc    Markdown lint rules
├── .nvmrc                      Node version used locally and in CI
├── .prettierrc.json            Formatting rules
├── eslint.config.js            JavaScript lint rules
├── package.json                Scripts and pinned tooling
├── scripts/                    Command line entry points used by CI
├── src/                        Source code
├── test/                       Tests, mirroring src/
├── CONTRIBUTING.md             Branch protection rules and the git workflow
└── README.md                   This file
```

## Local setup

Requires the Node version in `.nvmrc`.

```bash
git clone https://github.com/aidenrigali04-ops/Engineering-System.git
cd Engineering-System
nvm use          # or install the version named in .nvmrc
npm ci           # install exactly what the lockfile specifies
npm run check    # run everything CI runs
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the test suite |
| `npm run test:watch` | Re-run tests as files change |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run lint` | Lint JavaScript |
| `npm run lint:md` | Lint markdown |
| `npm run format` | Rewrite files to match the formatting rules |
| `npm run format:check` | Fail if anything is unformatted |
| `npm run check` | Everything above, in the order CI runs it |

## Workflow

Work happens on short-lived branches and lands on `main` through a pull request.
`main` is protected, so this is enforced rather than optional. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full rules.

```bash
git switch -c descriptive-branch-name   # start work
git add -p                              # stage changes deliberately
git commit -m "short summary"           # commit
git push -u origin HEAD                 # publish the branch
gh pr create                            # open a pull request
```

## Learning roadmap

Tooling to layer in, roughly in the order it becomes useful:

- [x] Git fundamentals: repository, commits, remotes, branches
- [x] Branch protection rules on `main`
- [x] Pull requests and code review on GitHub
- [x] Continuous integration with GitHub Actions
- [x] Automated testing and a test runner
- [x] Linting and formatting enforced in CI
- [x] Dependency management and lockfiles
- [ ] Pre-commit hooks so failures surface before pushing
- [ ] Automated dependency updates
- [ ] Static type checking
- [ ] Issue tracking and project planning
- [ ] Semantic versioning and releases
- [ ] Containerization
- [ ] Deployment and environments
- [ ] Monitoring and observability
