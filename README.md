# Engineering System

A learning playground for practicing the tools and workflows used in professional
software engineering: version control, code review, automated checks, and release
process.

The goal here is deliberate practice with the *process*, not shipping a product.
Features exist only as excuses to exercise the tooling.

## Status

Bootstrapping. The repository is connected to GitHub and has a baseline commit.
No application code yet.

## Repository layout

```
.
├── .cursor/         Editor configuration shared with the repo
├── .gitignore       Files git should never track
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
`main` is intended to always be in a working state.

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
- [ ] Pull requests and code review on GitHub
- [ ] Branch protection rules on `main`
- [ ] Continuous integration with GitHub Actions
- [ ] Automated testing and a test runner
- [ ] Linting and formatting enforced in CI
- [ ] Dependency management and lockfiles
- [ ] Issue tracking and project planning
- [ ] Semantic versioning and releases
- [ ] Containerization
- [ ] Deployment and environments
- [ ] Monitoring and observability
