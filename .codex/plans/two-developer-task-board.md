# Two developer task board

## Outcome

Create a small, dependency-free task board that gives two developers a simple shared codebase to build together on GitHub.

## Acceptance checks

- The board can create, edit, move, filter, and delete tasks.
- Tasks persist in the current browser using local storage.
- The interface works on desktop and narrow screens and uses Japanese labels.
- The README explains setup, the local-only data boundary, and a two-person GitHub workflow.
- The repository is committed and pushed to the requested empty GitHub repository.

## Scope

- Static HTML, CSS, and JavaScript; no dependencies, authentication, backend, or deployment.
- Include contribution guidance and a pull request template.

## Risk and assumptions

- Low risk; no external services or data migrations.
- “Shared” means the two developers collaborate on the source through GitHub. Board data stays in each browser and does not synchronize between people.
- The empty repository's `main` branch is the starting point.

## Steps

1. Add the board interface and local task behavior.
2. Document local use and the two-person branch / pull request workflow.
3. Review the diff and run non-test static checks.
4. Commit the intended files and push `main` to the supplied repository.

## Verification

- Inspect the full diff and run `git diff --check`.
- Parse-check the JavaScript with Node if available.
- Confirm the pushed branch points to the new commit.

## Rollback

- Since the remote is empty, any follow-up correction can be made in a normal commit. Do not rewrite remote history.

