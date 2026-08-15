# Engineering System

A learning playground for practicing the tools and workflows used in professional
software engineering: version control, code review, automated checks, and release
process.

The goal here is deliberate practice with the *process*, not shipping a product.
Features exist only as excuses to exercise the tooling.

## Status

`main` is protected, changes land through pull requests, and CI type-checks,
tests, lints, and builds every one. The service is TypeScript on Node, and
exposes a health endpoint plus a tracked repositories resource stored in
Postgres.

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
├── compose.yaml                Local Postgres, via Docker Compose
├── eslint.config.js            Lint rules
├── package.json                Scripts and pinned tooling
├── prisma/                     Database schema and migrations
├── tsconfig.json               Type checking rules
├── tsconfig.build.json         Production build settings
├── scripts/                    Command line entry points used by CI
├── src/app.ts                  Routing, request parsing, status codes
├── src/config.ts               Configuration read from the environment
├── src/pg-store.ts             The Postgres-backed store, via Prisma
├── src/repositories.ts         Tracked repositories: validation and rules
├── src/server.ts               Entry point: listens and shuts down cleanly
├── src/store.ts                Storage interface; implemented by pg-store.ts
├── test/                       Tests, mirroring src/
├── CONTRIBUTING.md             Branch protection rules and the git workflow
└── README.md                   This file
```

## Local setup

Requires the Node version in `.nvmrc`. Anything older cannot run TypeScript
without a compile step, and Node 20 and earlier are past end of life.

```bash
git clone https://github.com/aidenrigali04-ops/Engineering-System.git
cd Engineering-System
nvm install      # install the version named in .nvmrc
nvm use
npm ci                  # install exactly what the lockfile specifies
docker compose up -d    # start local Postgres
cp .env.example .env    # point the service at it
npm run db:migrate      # create the schema
npm run check           # run everything CI runs
```

## TypeScript without a build step

Node runs `.ts` files directly by stripping the types out, so development never
waits on a compiler. `tsconfig.json` sets `erasableSyntaxOnly`, which rejects
any syntax Node cannot strip on its own — enums, for instance — and keeps that
guarantee from quietly breaking.

Type *checking* is therefore a separate job from running the code. `npm run
typecheck` is what actually verifies types, and CI runs it, because stripping
types is not the same as checking them.

`npm run build` compiles to `dist/` for production, rewriting `./app.ts`
imports to `./app.js` on the way out. CI builds and then starts the result, so
a broken build cannot reach `main` unnoticed.

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

### `GET /ready`

Reports whether this instance can do real work right now, which is a
different question from `/health`: it checks the database, so it fails when
the database is unreachable even though the process itself is fine.

```bash
curl http://localhost:3000/ready
```

```json
{ "status": "ready" }
```

or, when the database cannot be reached:

```json
{ "status": "unavailable" }
```

| Status | Body |
| --- | --- |
| `200` | `{ "status": "ready" }` |
| `503` | `{ "status": "unavailable" }` |

### Tracked repositories

A tracked repository is one this service watches. Storage is Postgres, via
Prisma.

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
| `DATABASE_URL` | (required) | Postgres connection string |

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the service |
| `npm run dev` | Start with automatic restart on file changes |
| `npm run build` | Compile to `dist/` for production |
| `npm run start:built` | Run the compiled output, as production would |
| `npm run typecheck` | Check types without emitting anything |
| `npm test` | Run the test suite |
| `npm run test:watch` | Re-run tests as files change |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run lint` | Lint TypeScript |
| `npm run lint:md` | Lint markdown |
| `npm run format` | Rewrite files to match the formatting rules |
| `npm run format:check` | Fail if anything is unformatted |
| `npm run check` | Everything above, in the order CI runs it |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply existing migrations, as production would |

## Tests

Tests live in `test/`, mirroring `src/`, and run in two layers:

| Layer | Example | What it catches |
| --- | --- | --- |
| Unit | `test/config.test.ts` | Logic errors inside one function |
| Integration | `test/app.test.ts` | Wiring: routing, status codes, response bodies |

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
- [x] Static type checking
- [x] Issue tracking and project planning
- [ ] Semantic versioning and releases
- [ ] Containerization
- [ ] Deployment and environments
- [ ] Monitoring and observability
