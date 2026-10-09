# Contributing

Thank you for your interest in contributing to `agent-readiness-action`.

---

## Setup

```bash
git clone https://github.com/alipajand/agent-readiness-action.git
cd agent-readiness-action
git submodule update --init   # vendored engines
pnpm install
```

## Development workflow

```bash
pnpm test                # run the full test suite
pnpm test:coverage       # run tests with coverage
pnpm typecheck           # TypeScript type-check
pnpm format              # format all files with Prettier
pnpm format:check        # check formatting without writing
pnpm build               # rebuild dist/ with ncc
```

All of the following must pass before opening a PR:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Workflows run the committed `dist/index.js`, so commit `dist/` whenever source, dependencies, or
a submodule changed. CI fails when `dist/` is stale.

## Bundled engines

`vendor/agent-readiness-kit` and `vendor/agent-context-doctor` are git submodules. Do not edit
files under `vendor/`: change the upstream repository, then move the submodule to the new commit
and rebuild `dist/`.

## Rules

- No runtime downloads (`npx`, `npm install`, fetching engines) and no network calls other than
  the GitHub API used for PR comments.
- Treat everything from the audited repository as untrusted: escape it in Markdown, log it with
  `logUntrusted`, and keep file writes inside `repo-path`.
- Keep TypeScript below 7: ncc needs the TypeScript JS API.

## Open an issue first for

- Input or output names and defaults in `action.yml` (they are a public contract)
- Token handling, permissions, or which comments the action edits
- New dependencies
- The `node24` runtime

## Opening a pull request

- Keep PRs small and focused on a single concern.
- Reference the issue number if one exists.
- Explain _why_ the change is needed, not just what changed.
- Add an entry under `[Unreleased]` in `CHANGELOG.md` for user-visible changes.
- All CI checks must pass before requesting review.

## Reporting issues

Open a GitHub issue with:

- The action version or commit SHA you ran
- The workflow step that uses the action, including its inputs
- The relevant part of the job log or summary

Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
