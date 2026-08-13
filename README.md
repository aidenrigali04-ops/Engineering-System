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
├── src/app.js                  Routing, request parsing, status codes
├── src/config.js               Configuration read from the environment
├── src/repositories.js         Tracked repositories: validation and rules
├── src/server.js               Entry point: listens and shuts down cleanly
├── src/store.js                Storage, behind a swappable interface
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

### Tracked repositories

A tracked repository is one this service watches. Storage is currently
in-memory, so everything is lost when the process restarts.

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/repositories` | `201` with the created repository and a `Location` header |
| `GET` | `/repositories` | `200` with `{ "data": [...] }`, newest first |
| `GET` | `/repositories/:id` | `200`, or `404` if there is no such id |
| `DELETE` | `/repositories/:id` | `204`, or `404` if there is no such id |

```bash
curl -X POST http://localhost:3000/repositories \
  -H 'content-type: application/json' \
  -d '{"owner":"aidenrigali04-ops","name":"Engineering-System"}'
```

```json
{
  "id": "6f1e...",
  "owner": "aidenrigali04-ops",
  "name": "Engineering-System",
  "fullName": "aidenrigali04-ops/Engineering-System",
  "trackedAt": "2026-08-13T01:24:00.000Z"
}
```

`owner` and `name` are the only accepted fields, and both are required.
Anything else in the body is rejected rather than ignored, so a misspelled
field fails loudly instead of quietly doing nothing.

| Status | When |
| --- | --- |
| `400` | The body is missing, unparseable, or fails validation |
| `409` | That `owner/name` is already tracked, ignoring case |
| `413` | The body is larger than 16 KB |

Failures carry the reason: `{ "error": "invalid", "details": ["..."] }`.

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

## Tests

Tests live in `test/`, mirroring `src/`, and run in two layers:

| Layer | Example | What it catches |
| --- | --- | --- |
| Unit | `test/config.test.js` | Logic errors inside one function |
| Integration | `test/app.test.js` | Wiring: routing, status codes, response bodies |

The integration tests start the real server on an ephemeral port and make real
HTTP requests against it. Nothing is stubbed, so they fail if the pieces stop
fitting together — which unit tests, by definition, cannot detect.

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
