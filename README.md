# Engineering System

A learning playground for practicing the tools and workflows used in professional
software engineering: version control, code review, automated checks, and release
process.

The goal here is deliberate practice with the *process*, not shipping a product.
Features exist only as excuses to exercise the tooling.

## Status

Bootstrapping. The repository is connected to GitHub, `main` is protected, and
changes land through pull requests. No application code yet.

## Repository layout

```
.
├── .cursor/         Editor configuration shared with the repo
├── .gitignore       Files git should never track
├── CONTRIBUTING.md  Branch protection rules and the day-to-day git workflow
└── README.md        This file
```

## Local setup

Clone the repository and confirm git can talk to GitHub:

```bash
git clone https://github.com/aidenrigali04-ops/Engineering-System.git
cd Engineering-System
git remote -v
```

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
- [ ] Continuous integration with GitHub Actions
- [ ] Automated testing and a test runner
- [ ] Linting and formatting enforced in CI
- [ ] Dependency management and lockfiles
- [ ] Issue tracking and project planning
- [ ] Semantic versioning and releases
- [ ] Containerization
- [ ] Deployment and environments
- [ ] Monitoring and observability
