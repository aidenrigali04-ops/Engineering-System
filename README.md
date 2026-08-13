# Engineering System

A learning playground for practicing the tools and workflows used in professional
software engineering: version control, code review, automated checks, and release
process.

The goal here is deliberate practice with the *process*, not shipping a product.
Features exist only as excuses to exercise the tooling.

## Status

`main` is protected, changes land through pull requests, and CI runs tests,
linting, and formatting on every one. The service currently exposes a single
health endpoint.

## Repository layout

```text
.
├── .cursor/                    Editor configuration shared with the repo
├── .github/ISSUE_TEMPLATE/     Issue forms for tasks and bugs
├── .github/workflows/ci.yml    Checks that run on every pull request
├── .gitignore                  Files git should never track
├── .markdownlint-cli2.jsonc    Markdown lint rules
├── .nvmrc                      Node version used locally and in CI
├── .prettierrc.json            Formatting rules
├── eslint.config.js            JavaScript lint rules
├── package.json                Scripts and pinned tooling
├── scripts/                    Command line entry points used by CI
├── src/app.js                  Routing and request handlers
├── src/config.js               Configuration read from the environment
├── src/server.js               Entry point: listens and shuts down cleanly
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

## Running the service

```bash
npm start              # listens on port 3000
PORT=8080 npm start    # or any port you choose
npm run dev            # restarts automatically when files change
```

The server refuses to start if `PORT` is set to something that is not a valid
port number, rather than falling back to the default and listening somewhere
you did not ask for.

## API

### `GET /health`

Reports whether the process is able to serve requests. This is what a load
balancer, orchestrator, or deployment system polls to decide whether to send
traffic to this instance.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "uptime": 42 }
```

The check is deliberately shallow. It should only fail for conditions that the
caller's reaction would actually fix — restarting this process cannot repair a
third party's outage, so external dependencies are not checked here.

Any other route returns 404 with `{ "error": "not_found" }`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. `0` asks the OS for a free port. |

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the service |
| `npm run dev` | Start with automatic restart on file changes |
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
- [x] Issue tracking and project planning
- [ ] Semantic versioning and releases
- [ ] Containerization
- [ ] Deployment and environments
- [ ] Monitoring and observability
