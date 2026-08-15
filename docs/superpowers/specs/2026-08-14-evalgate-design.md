# evalgate — design

A CI check that blocks prompt changes which make output quality worse, and can
tell the difference between a real regression and random noise.

- **Status:** approved, not yet implemented
- **Date:** 2026-08-14
- **Repository:** `aidenrigali04-ops/Engineering-System`

## Problem

A prompt is the instruction text sent to a language model on every request. In
a production AI feature it is the most consequential logic in the system, and
it is edited like prose: someone rewords a sentence, it reads fine, it merges.

Ordinary code has a safety net. Break it and a test fails. Prompts have no
equivalent. Quality degrades silently, nobody can attribute the loss to a
specific change, and the regression is usually discovered weeks later through
customer complaints rather than through tooling.

Building the missing safety net is harder than it appears, for three reasons.

1. **Non-determinism.** The same prompt on the same input produces different
   output every time. Scores move on their own.
2. **Small samples.** Two model calls per test case means a realistic per-pull-
   request budget is 50–300 cases, not tens of thousands.
3. **Optional stopping.** A developer who dislikes a result adds cases and runs
   again. Each additional look is another opportunity to mistake a fluke for a
   finding. Under repeated peeking a fixed-threshold rule's false alarm rate
   rises without bound.

A gate that ignores any of these produces confident answers that are wrong, and
a gate that blocks good work gets switched off within a week.

## Goals

- Block a merge when a prompt change causes a quality regression larger than a
  configured tolerance, with a false alarm rate at or below a stated bound
- Remain statistically valid when results are inspected after every case
- Report uncertainty honestly, including when the evidence is insufficient
- Cost cents per run and finish in single-digit minutes
- Produce a published, reproducible benchmark of the gate's own error rates

## Non-goals

- Competing on breadth with commercial evaluation platforms
- Tracing, prompt management, or dataset curation as product surfaces
- Training, fine-tuning, or serving models
- Supporting CI systems other than GitHub Actions in the first version
- Multi-region, high-availability, or horizontal scale beyond a handful of
  concurrent runs

## Users and usage

The user is a developer whose repository contains a prompt. They are not
expected to understand sequential testing. They see a red or green check.

### Setup, performed once

1. Sign in with GitHub, register `owner/repo`, receive an API token
2. Store the token as a repository secret named `EVALGATE_TOKEN`
3. Add `evalgate.yml` to the repository root
4. Add a workflow file invoking the evalgate action on pull requests

### Per pull request

1. A developer edits a watched prompt file and opens a pull request
2. The action compares the watched paths against the merge base. If none
   changed it exits successfully in seconds, having spent nothing. This is the
   common case.
3. If a watched prompt changed, the action collects the baseline prompt from
   the merge base, the candidate prompt from the pull request head, and the
   test suite, then posts them to the service
4. The service returns a run identifier immediately and processes the run
   asynchronously. The action polls, printing progress.
5. A worker generates output from both prompt versions for each case, grades
   both, and records a paired observation
6. After every observation the statistical decision is re-evaluated. The run
   stops as soon as the evidence is conclusive.
7. The action posts a pull request comment and exits zero or non-zero
8. A non-zero exit fails the required check, which blocks the merge

The action posts the comment, not the service. The action already runs inside
the user's CI with permission to write to their pull request, so this removes
the need for a GitHub App registration, webhook endpoints, and a public
callback URL.

### What the user sees

A pull request comment containing the verdict, the estimated effect and its
confidence interval, the number of cases used, the cost, the worst-regressing
cases, and a link to a run detail page.

| Verdict | Condition | Merge |
| --- | --- | --- |
| `PASS` | Interval rules out a regression larger than δ | Allowed |
| `BLOCK` | Interval confirms a regression larger than δ | Blocked |
| `INCONCLUSIVE` | Case or budget cap reached without either | Allowed |
| `ERROR` | Infrastructure failure or excessive missing data | Allowed |

`INCONCLUSIVE` reports what it can support: the tightest bound achieved, and
the approximate number of cases required to resolve a difference of size δ.

`ERROR` renders the check as neutral rather than failing. A broken evaluator
must never be mistaken for a passing evaluation, and must never block work.

### Interfaces

| Interface | Purpose |
| --- | --- |
| GitHub Action | Primary path, runs automatically on pull requests |
| CLI | `evalgate run` locally, before pushing |
| HTTP API | Direct integration from other CI systems |

The action is a thin wrapper over the CLI, so building both costs little more
than building one.

## Architecture

```text
                    GitHub Actions runner
                    ┌──────────────────┐
                    │  evalgate action │
                    └────────┬─────────┘
                             │ HTTPS, token auth
                             ▼
Internet ──▶ ALB (HTTPS, ACM) ──▶ ECS Fargate: api ×2 ──┐
                                  ECS Fargate: worker ×1 ├──▶ RDS Postgres
ECR (images) · Secrets Manager (model key, session key) ─┘
```

| Component | Responsibility |
| --- | --- |
| `api` | HTTP surface, authentication, run intake, verdict serving |
| `worker` | Same image, different entrypoint. Claims jobs, generates, grades, decides. |
| Postgres | All state: repositories, prompts, cases, runs, observations, jobs |
| `graders` | Deterministic, classifier, and judge scoring |
| `stats` | Paired anytime-valid confidence sequence and verdict logic |
| `action` | Change detection, payload assembly, comment rendering |

The api and worker ship as one image with two entrypoints. They share the
domain model, and splitting them into separate artifacts would add deployment
surface without reducing coupling.

### Queue: Postgres, not SQS

Jobs live in a Postgres table, claimed with `SELECT ... FOR UPDATE SKIP
LOCKED`. Several workers pull from one table without blocking each other.

SQS is the more recognizable choice. It is rejected because a transactional job
table lets job state and results commit in a single transaction. With an
external queue, marking a job complete and writing its results are two writes
to two systems, and a crash between them leaves a job that claims to be done
with no results behind it. At higher throughput, or with workers that need to
scale independently of the database, the tradeoff reverses.

Reliability follows from three mechanisms:

- **Stale lock reaper.** Locks held longer than 10 minutes are released so a
  crashed worker's job is retried.
- **At-least-once with idempotent effects.** Retries may duplicate work. A
  unique constraint on `(run_id, case_hash, variant, attempt)` makes a
  duplicate generation a no-op rather than a double charge.
- **Dead lettering.** After 5 attempts a job moves to `dead` with its last
  error preserved. It does not retry forever.

## Statistical design

Three decisions, each with a consequence elsewhere in the system.

### Pair every comparison

Both prompt versions run against the same case, and the analysis operates on
the per-case difference rather than on two independent score distributions.

Test cases vary enormously in difficulty. Comparing separate averages puts all
of that variation into the noise term. Pairing cancels it: a hard case is hard
for both versions, so subtracting removes difficulty and leaves the prompt
difference. In practice this reduces the number of cases required for a given
confidence by a factor of three to ten, at no cost. The benchmark reports the
factor actually observed on this corpus.

The consequence is structural. Generations are keyed by
`(run_id, case_hash, variant)`, and the statistics consume a stream of paired
differences. An unpaired observation is unusable and is never analyzed.

### Test non-inferiority, not equality

No sample size can prove two things identical. The system instead tests whether
the candidate is worse by more than a configured margin δ.

δ is a product decision, not a statistical one, and belongs in the repository's
configuration with a documented default. A team shipping legal summaries and a
team shipping social copy have legitimately different tolerances.

### Make peeking free

Let `D_i` be the per-case difference, candidate minus baseline, on a score
scale of 0 to 1. The system maintains an **anytime-valid confidence sequence**
for the mean of `D`: an interval whose stated coverage holds simultaneously at
every sample size, not only at one pre-committed stopping point.

The decision rule is a single comparison against the tolerance line at `-δ`:

- Interval entirely below `-δ` → `BLOCK`
- Interval entirely above `-δ` → `PASS`
- Interval straddles `-δ` → continue sampling; at the cap, `INCONCLUSIVE`

Both error directions are governed by the same coverage guarantee.

**Why peeking is free.** Reframe the test as a betting game. Start with one
unit of capital. Before each case, bet a fraction of it on the claim that the
candidate is worse. If the case supports the claim the capital grows, otherwise
it shrinks. If there is no regression the game is fair, and a fair game cannot
be beaten. So capital reaching `1/α` means either a `1-in-1/α` stroke of luck
or a false premise. Crucially, a fair game stays fair under any stopping rule:
choosing when to walk away cannot make it profitable. This is Ville's
inequality applied to a nonnegative martingale, and it is why continuous
monitoring costs nothing here while it destroys a fixed-horizon test.

**Implementation.** The confidence sequence is obtained by inverting a family
of capital processes over a grid of 201 candidate means spanning `[-1, 1]`. For
each grid point a capital process is maintained; a point remains in the
interval while its capital stays below `1/α`. The reported interval is the
range of surviving points. The betting fraction is a predictable plug-in
estimate derived from the running mean and variance of observations so far,
clipped to `[0, 0.5]` so that no single observation can bankrupt the capital.

The precise betting strategy is a tuning choice, not a correctness
requirement. Correctness is established empirically by the A/A simulation
described below, which runs in CI and fails the build if coverage degrades.

**Secondary benefit.** A clearly broken prompt crosses the threshold early and
the run stops, so the remaining cases are never generated. Sequential testing
reduces cost per decision as well as error rate. A fixed-sample test must run
every case every time.

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| α | 0.05 | Target false alarm rate |
| δ (`min_effect`) | 0.02 | Default tolerated regression, score units |
| `max_cases` | 200 | Default per-run case cap |
| `max_cost_usd` | 2.00 | Default per-run spend cap |
| Grid points | 201 | Resolution of the confidence sequence |

## Graders

Every grader returns a score in `[0, 1]`. A case score is the configured
weighted mean of its grader scores. Graders are layered cheapest and most
reliable first.

| Layer | Mechanism | Example |
| --- | --- | --- |
| Deterministic | Plain code, no model | Does the summary cite a file absent from the diff? |
| Classifier | Small model, one binary question | Does the summary describe the actual change? |
| Judge | Strong model, pairwise choice | Which of these two summaries is more useful? |

The deterministic layer carries the load. The file-path check is a genuine
hallucination detector with objective ground truth, because the set of files in
a diff is known exactly.

### Judge validity

An unvalidated model judge is a random number generator with good manners. Two
properties must be measured and published before the judge is weighted.

- **Human agreement.** 60 comparisons are labeled by hand and compared against
  the judge using Cohen's kappa, which corrects raw agreement for the agreement
  expected by chance. The value is published whatever it is. If it falls below
  0.6 the judge's weight is reduced and the shortfall documented.
- **Position bias.** Model judges are known to favor whichever candidate is
  presented first. Every calibration comparison is run in both orders and the
  disagreement rate is reported. Presentation order is randomized in
  production regardless of the measured rate.

Judge comparisons are pairwise rather than absolute. Asking which of two
outputs is better is substantially more reliable than asking for a score out of
ten.

## Benchmark

The gate's own error rates are measured, not asserted. The measurement is
split so that the expensive half runs once and the analytical half runs
without cost.

### Phase 1 — collect once

- Assemble a corpus of 120 real diffs via the GitHub API from this repository
  and a set of public repositories
- Generate 8 samples per case from the production prompt, grading each
- Generate 8 samples per case from a deliberately degraded prompt, grading each
- Store all 1,920 graded generations in `benchmark_samples`

Cost is a few dollars on a small model, paid once.

### Phase 2 — simulate repeatedly, at no cost

Every simulation draws from stored samples. No model is called.

- **False alarm rate (A/A).** Both the baseline and candidate scores for a
  simulated experiment are drawn from the *same* pool. There is no difference
  by construction, so any `BLOCK` is by definition a false alarm. 2,000
  simulated experiments.
- **Detection power (A/B).** Baseline drawn from the good pool, candidate from
  the degraded pool. A genuine regression exists, of an effect size that is
  measured and reported rather than assumed. 2,000 simulated experiments.
- **Power curve.** Pooled scores are shifted by a range of synthetic effect
  sizes to report power as a function of the true regression size.
- **Peek curve.** The naive fixed-threshold rule is evaluated at 1, 5, and
  per-case inspection frequencies, so it is represented at its strongest rather
  than as a straw man.

Published results compare rules on four axes: false alarm rate, detection
power, mean cases consumed, and mean cost per decision.

Reporting power alongside the false alarm rate is mandatory. A gate that never
blocks has a perfect false alarm rate and no value, and any competent reviewer
will ask for the second number first.

### The guarantee is a test

Because Phase 2 reads stored data, it runs in CI on every pull request. The A/A
simulation is expressed as an assertion that the false alarm rate does not
exceed α. An implementation change that degrades coverage turns the build red.

Published benchmark numbers are regenerated by this job and therefore cannot go
stale, and any reader can reproduce them from a clone.

## Data model

Twelve tables. Three ideas do most of the work.

### Content addressing

`prompts` and `cases` are keyed by the SHA-256 of their content rather than a
surrogate identifier. Identical text stores once. This yields deduplication,
exact lineage from every stored output back to the text that produced it, and
run idempotency: a run's identity is the hash of
`(repository, pr_number, baseline_hash, candidate_hash, suite_hash)`, so
resubmitting identical work returns the existing run instead of paying twice.

### Generation is separate from grading

Generating output costs money. Grading it does not. Keeping `grades` in its own
table means an improved grader can re-score the entire history without calling
a model again. Folding scores into the generation row would force a choice
between regenerating everything and living with inconsistent history.

### The decision is an audit trail

`observations` stores one row per case in sequence, including the confidence
interval and capital state after that case. The decision can be replayed step
by step, which powers the run detail page, makes debugging tractable, and
answers "why did this block at case 84" with evidence rather than assertion.

### Tables

| Table | Contents |
| --- | --- |
| `accounts` | GitHub identity |
| `api_tokens` | Hashed tokens, never stored in plaintext |
| `repositories` | Tracked repositories, scoped to an account |
| `prompts` | Content-addressed prompt text |
| `cases` | Content-addressed test cases |
| `runs` | One comparison, its configuration, verdict, and totals |
| `generations` | One model output, with tokens, cost, and latency |
| `grades` | One grader's score for one generation |
| `observations` | Per-case paired difference and the statistical state after it |
| `jobs` | The work queue |
| `benchmark_samples` | The pooled generations backing offline simulation |
| `human_labels` | Hand-labeled comparisons for judge calibration |

### Indexes

- Partial index on `jobs` where `state = 'pending'`, ordered by `run_after` —
  the queue's hot path
- Unique on `generations (run_id, case_hash, variant, attempt)` — makes retries
  safe
- Unique on `runs (idempotency_key)`
- `observations (run_id, seq)`

## Error handling

**Model provider failures.** Up to 4 attempts with exponential backoff and full
jitter, base 500 ms, capped at 30 s. Retried only on 429, 5xx, and timeouts. A
400 is never retried, because a malformed request stays malformed. `Retry-After`
is honored where supplied.

**Timeouts.** 60 s per generation, 15 minutes per run.

**Budget.** Estimated before starting and tracked as the run proceeds. On
reaching the cap the run stops and reports the conclusion supported by the
cases completed.

**Missing data is not neutral.** If the candidate prompt causes the model to
time out or refuse more often than the baseline, those failures are the
regression, and discarding them biases the result toward `PASS` — the gate
would systematically miss the failure mode it most needs to catch. Therefore:

- The per-case failure indicator forms a second paired stream — did the
  candidate fail where the baseline succeeded — analyzed by the same
  anytime-valid machinery at the same α. There is no separate magic threshold:
  a fixed cutoff here would reintroduce the peeking problem for this signal.
- If that stream confirms the candidate fails more often, the verdict is
  `BLOCK`, irrespective of the scores of the generations that did succeed
- When failures are balanced, the whole pair is dropped, never half of it, and
  the count is recorded
- If more than 10% of pairs are dropped the verdict is `ERROR`, not
  `INCONCLUSIVE`, because the run no longer supports any conclusion

**Liveness against readiness.** `/health` stays shallow, as the current README
argues: it should fail only for conditions a restart would fix. `/ready` checks
the database and governs whether traffic is routed here. Restarting a process
cannot repair a database, so that check belongs only in readiness.

**Request size.** Run creation accepts up to 2 MB, since the payload carries a
test suite. Other endpoints keep the existing 16 KB limit. Negotiating case
hashes so the action uploads only unseen cases is a later optimization, not
part of this version.

## Testing

| Layer | Scope | Catches |
| --- | --- | --- |
| Unit | Graders, hashing, config, capital process | Logic errors in pure functions |
| Statistical | 2,000-run A/A asserting false alarms ≤ α | A broken core guarantee |
| Integration | Real HTTP and real Postgres, faked provider | Wiring, transactions, queue |
| Provider contract | One live model call, opt-in behind a secret | Provider API drift |
| End-to-end | The action against the deployed service, on this repo | The product actually working |

The **fake provider** is the most important test tool in the project: a
deterministic stub driven by a seeded generator with a configurable score
distribution, able to degrade on demand. It drives the entire pipeline —
generation, grading, statistics, verdict — with no network calls and no
flakiness, and it is how `BLOCK` is tested at all. The seam is the provider
adapter, the narrowest interface this project owns; faking at the HTTP client
would couple tests to a wire format controlled by someone else.

**Live model calls are disabled in CI by default**, enabled only by an
explicitly set secret. A suite that cannot run when a billing account is empty
will eventually be red for reasons unrelated to the code, and a persistently
red suite stops being read.

## Observability

- Structured JSON logs carrying one correlation identifier from HTTP request
  through job through every generation (closes issue #9)
- OpenTelemetry spans nested `run → case → generation → grade`, so a slow run
  identifies its own slow layer
- Metrics: verdict counts, cases per run, cost per run, provider error rate,
  queue depth, and oldest pending job age. The last two are the signal that
  workers have fallen behind.

## Security

- API tokens are hashed at rest and shown once at creation
- Prompt text is customer intellectual property; it is stored in RDS with
  encryption at rest enabled and is never logged
- The GitHub token stays inside the action and is never transmitted to the
  service
- Model provider credentials and the session key live in Secrets Manager and
  are injected as ECS task secrets, never baked into an image
- Per-token rate limiting on the public API
- The existing branch-name check already avoids interpolating attacker-
  controlled text into a shell; the same discipline applies to any new
  workflow steps

## Infrastructure

All resources are defined in Terraform.

| Resource | Configuration |
| --- | --- |
| VPC | Two public subnets, two private subnets |
| ALB | HTTPS via ACM, the only public entry point |
| ECS Fargate `api` | Two tasks, 0.25 vCPU, 512 MB |
| ECS Fargate `worker` | One task, 0.5 vCPU, 1 GB |
| RDS Postgres | `db.t4g.micro`, single AZ, private subnets |
| ECR | Container images |
| Secrets Manager | Model provider key, session key |

**No NAT Gateway.** Fargate tasks run in public subnets with public addresses,
reachable only from the ALB by security group rule. A NAT Gateway costs roughly
$32 per month — more than the database — and this deployment does not need one.

Estimated monthly cost: ALB ~$17, RDS ~$15, Fargate ~$9, storage and ECR ~$5.
Total approximately $46.

The container image is multi-stage, runs as a non-root user, and declares a
healthcheck.

## Configuration reference

`evalgate.yml`, at the repository root:

```yaml
prompts:
  - path: prompts/pr-description.md
    suite: evals/pr-description
    model: claude-haiku-4-5
    graders: [deterministic, judge]
    weights:
      deterministic: 0.6
      judge: 0.4
    min_effect: 0.02 # δ, tolerated regression in score units
    max_cases: 200
    max_cost_usd: 2.00
```

`path`, `suite`, and `model` are required. Everything else defaults to the
values in the constants table above.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/runs` | Create a run; idempotent by fingerprint |
| `GET` | `/v1/runs/:id` | Status and verdict |
| `GET` | `/v1/runs` | List runs for a repository |
| `POST` | `/v1/repositories` | Register a repository |
| `GET` | `/v1/repositories` | List registered repositories |
| `POST` | `/v1/tokens` | Issue an API token |
| `GET` | `/runs/:id` | Human-readable run detail page |
| `GET` | `/health` | Liveness, shallow by design |
| `GET` | `/ready` | Readiness, checks the database |
| `GET` | `/auth/github` | Begin GitHub sign-in |
| `GET` | `/auth/github/callback` | Complete GitHub sign-in |

Error responses keep the repository's existing shape:
`{ "error": "invalid", "details": ["..."] }`.

## Schedule

Fifteen working days, sequenced so the differentiating work completes before
the infrastructure work begins.

### Week 1 — foundations

| Day | Work | Closes |
| --- | --- | --- |
| 1 | Postgres, Prisma, migrations; repositories moved off in-memory; Postgres in CI | #18, #19 |
| 2 | Full schema, content-addressed hashing, job table with `SKIP LOCKED` | — |
| 3 | Provider adapter, fake provider, retries, backoff, budget cap | — |
| 4 | Deterministic graders, suite loader, case format | — |
| 5 | Run orchestration end to end against the fake provider | #8 |

Milestone: the pipeline runs with no real model and no statistics.

### Week 2 — the differentiator

| Day | Work |
| --- | --- |
| 6 | Paired difference stream, capital process, confidence sequence |
| 7 | Three-way verdict, non-inferiority margin, property tests |
| 8 | Benchmark phase 1: corpus from the GitHub API, pooled generation, storage |
| 9 | Benchmark phase 2: A/A and A/B simulation, peek curve, CI assertion |
| 10 | Judge grader, 60 hand labels, Cohen's kappa, position-bias check |

Milestone at day 9: the published claim becomes true and verifiable.

### Week 3 — surface and ship

| Day | Work | Closes |
| --- | --- | --- |
| 11 | API surface, token auth, GitHub sign-in, run detail page | — |
| 12 | CLI, action, comment rendering; dogfood by blocking a deliberately worse prompt | — |
| 13 | Dockerfile, ECR, structured logging, OpenTelemetry | #9, #10, #11 |
| 14 | Terraform: VPC, ALB, ECS, RDS, Secrets Manager; deploy | — |
| 15 | README rewrite with benchmark results and live links; buffer | — |

Pre-commit hooks and dependency automation (#12, #13) fill gaps; each is about
an hour.

## Risks

| Risk | Mitigation |
| --- | --- |
| Terraform and ECS overrun day 14 | Sequenced last. Everything of value ships by day 13, so an overrun delays polish rather than the artifact. |
| Model access problems surface on day 8 | A five-case dry run at the end of day 7 exposes auth and rate-limit issues a day early. |
| Hand labeling on day 10 is tedious | Two to three hours of unglamorous work with nothing to show. Budgeted explicitly. |
| Betting strategy under-covers | The A/A assertion fails the build, which is the intended detection mechanism. Tune and re-measure. |
| Benchmark corpus too small to detect small effects | Report the detectable effect size honestly rather than claiming sensitivity the data cannot support. |

### Cut list, in order

1. GitHub sign-in, replaced by a seeded token — half a day
2. Classifier grader, leaving deterministic and judge — half a day
3. CLI, leaving the action only — half a day
4. Run detail page, replaced by a JSON endpoint and a screenshot — one day

The benchmark is never cut. Without it this is a competent service with an AI
feature. With it, it is the only one that measured itself.

## Success criteria

1. A pull request in this repository where a deliberately degraded prompt was
   blocked by the service, publicly linkable
2. Published false alarm rate and detection power, regenerated by CI from
   stored samples and reproducible from a clone
3. Published judge kappa and position-bias flip rate, whatever the values
4. A live run detail page reachable over HTTPS
5. Monthly running cost at or below $50
6. Every change landed through a reviewed pull request with CI green

The final criterion is not decoration. `main` is protected, so the pull request
history is itself part of the deliverable: three weeks of scoped, reviewed,
tested changes are a portrait of how the work was done, which the finished
artifact alone cannot show.
