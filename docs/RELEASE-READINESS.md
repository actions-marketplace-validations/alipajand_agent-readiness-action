# Release readiness

Status on 2026-10-12, after the live client tests for the first integrations release. The GitHub
Action is released as v1.2.0 and `v1` points to it. No integration has been published, tagged, or
submitted.

## Verdict

| Release                                                                          | Verdict                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Action v1.2.0                                                             | **Released.** Tag `v1.2.0` and `v1` at `8e3b737`, tested in a consumer workflow before `v1` moved                                   |
| Integrations 0.1.0: skill, Claude Code plugin, MCP server (npm and MCP Registry) | **Ready to release after the release branch is merged.** Live tests in Claude Code passed after two permission fixes on that branch |
| Integrations 0.1.0: Cursor plugin                                                | **Not ready to submit: not tested.** Cursor is not installed on the build machine                                                   |

No security finding is open apart from D (dev-only, see [SECURITY-FINDINGS.md](SECURITY-FINDINGS.md)).

## Integrations acceptance tests

Run on 2026-10-12 on macOS with Node.js 24.11, Claude Code 2.1.278 signed in and run headless
(`claude -p`) from temporary fixture repositories, and the engines' own CLIs built from the pinned
submodules (`ark` and `acd` 1.0.0 at `f15924b` and `034a74c`). The credential fixture plants two
GitHub tokens, an AWS key id, and a configured MCP `env` value.

| Destination                                               | Result               | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Skill from the public repository (`npx skills add`) | **PASS**             | `skills@1.7.2 add alipajand/agent-readiness-action --skill agent-readiness-audit` copied the skill for Claude Code and for `.agents/skills`, identical to `main`. Its JSON equals `ark audit --json --no-history` and `acd audit --json` on 28 repositories and fixtures; the only differences are credentials masked in two issue ids. No audited tree changed. `version` names both commits |
| Skill in a live Claude Code session                       | **PASS** (after fix) | First run: the script call was denied (quoted script path). After the `SKILL.md` fix, two runs of `/agent-readiness-audit` and one of `/agent-readiness:agent-readiness-audit`: one script call each, no denial, readiness 31 and context 0 risky with 27 issues, as the engines report; no planted credential in the transcripts                                                             |
| Claude Code plugin command `/agent-readiness:audit`       | **PASS** (after fix) | First run: the script ran with `${CLAUDE_PLUGIN_ROOT}` expanded, but the command also sent the model to the `Skill` tool, which was denied. After the fix, with a path and without one: one script call, no denial, correct scores; the fixture's `CLAUDE.md` instructions were reported as data, not followed                                                                                |
| Claude Code plugin from the GitHub marketplace            | **PASS**             | `claude plugin marketplace add alipajand/agent-readiness-action` and `claude plugin install agent-readiness@agent-readiness` in an empty `CLAUDE_CONFIG_DIR`: version 0.1.0 enabled, cached copy identical to `main`                                                                                                                                                                          |
| MCP server (packed tarball) in Claude Code as host        | **PASS**             | Installed offline from `npm pack` (SHA-256 `d1cab977…`, reproducible). In a live session: connected, no startup or sandbox error; `audit_repository` 31 and `audit_agent_context` 0 risky, equal to the engines; `get_audit_report` paged 5 + 10 + 10 + 2 = 27 items; `OUTSIDE_ROOT` for a path outside the root; `CONFIG_INVALID` for an `.acdrc` linked outside; no planted credential      |
| MCP server with the official client SDK                   | **PASS**             | Same installed package: scores and summaries equal the engines on two repositories; `include_raw` equals `ark` and `acd` JSON; 9 pages of 3 with no duplicates; `OUTSIDE_ROOT` for outside, `..`, and relative traversal; `PATH_NOT_FOUND`; `REPORT_NOT_FOUND`; schema errors for a malformed id and an out-of-range limit; tools annotated read-only                                         |
| Cursor plugin                                             | **NOT TESTED**       | Cursor is not installed                                                                                                                                                                                                                                                                                                                                                                       |
| MCP server in Cursor                                      | **NOT TESTED**       | Cursor is not installed                                                                                                                                                                                                                                                                                                                                                                       |
| Windows                                                   | **NOT TESTED**       | No Windows machine or CI job                                                                                                                                                                                                                                                                                                                                                                  |
| Codex and other skill clients                             | **NOT TESTED**       | Not installed; `npx skills add` placed the skill in `.agents/skills`                                                                                                                                                                                                                                                                                                                          |
| Claude Code interactive session                           | **NOT TESTED**       | All live runs were headless. Headless mode denies a tool that is not pre-approved instead of prompting, which is how the two permission defects showed                                                                                                                                                                                                                                        |

Observed host behavior: when a plain-language request made the model load the skill on its own,
headless Claude Code denied the `Skill` tool call and the model read the files itself. Invoking the
command or the skill by name avoids it.

## Action release v1.2.0

### Engines

| Engine               | Commit    | Upstream                                                                                       |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| agent-readiness-kit  | `f15924b` | `main`, agent-readiness-kit#33                                                                 |
| agent-context-doctor | `034a74c` | `main`, merge commit of agent-context-doctor#74; contains `d40fbb2` and `d434560` from that PR |

`integrations/src/runtime/provenance.generated.ts`, the skill script header, and the MCP bundle
header name both commits.

### What changes for GitHub Action users

`action.yml`, `src/`, the inputs, the outputs, and the comment format are unchanged. `dist/index.js`
and `dist/licenses.txt` change because both engines moved (agent-readiness-kit `b490a30` →
`f15924b`, agent-context-doctor `d70de51` → `034a74c`):

| Area                                | Runtime effect                                                                                                                                                                                                                                           | Evidence                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled packages                    | `fast-glob`, `braces`, `micromatch`, and their dependencies leave `dist/`; `tinyglobby` and `fdir` enter. No network or new runtime capability                                                                                                           | `dist/licenses.txt` diff                                                                                                                                                                                         |
| Scores and outputs, Linux           | No change in readiness score, category scores, context score, grade, issue count, outputs, or job summary                                                                                                                                                | `main`'s `dist/` against the `03fa7f7` build: identical on 21 local repositories and an edge-case fixture. The `03fa7f7` build against this one: identical outputs and summaries on 27 repositories and fixtures |
| macOS and Windows runners           | Fixed-name lookups in the readiness engine (`README.md`, `CHANGELOG.md`, `package.json`, `.tool-versions`, …) now match case exactly, as on Linux. `Readme.md` no longer counts as `README.md` for the documentation checks                              | On a case-insensitive volume, the mixed-case fixture scored 37 instead of 38                                                                                                                                     |
| Credentials in the log and comments | With `context-audit: true`, a recognised credential quoted by a non-secret finding is masked in the log, the `json` output, and the job summary and PR comment issue table. The log of the credential fixture is the only log that changed in 27 runs    | Previous build: the fixture's GitHub-shaped token printed on three log lines. This build: zero occurrences in the log, summary, and outputs                                                                      |
| `.acdrc` linking outside the repo   | With `context-audit: true`, the step fails with `.acdrc … links outside …; refusing to read it`. Before, it quoted the first characters of the linked file in a parse error, or applied a JSON file as configuration. A link inside the repository works | Action run on a repository whose `.acdrc` links to a text file and to a JSON file outside it, with both builds                                                                                                   |
| Root dependencies                   | `fast-glob` replaced by `tinyglobby` (bundled). `commander` and `picocolors` added as pinned dev dependencies for the parity tests; the integrations workspace adds the MCP SDK, `zod`, and `ajv`. None reach `dist/`                                    | `package.json`, `pnpm-lock.yaml`                                                                                                                                                                                 |

The action does not use the doctor's baseline fingerprints, so the fingerprint change noted in the
doctor's changelog does not affect `baseline-ref`.

### Automated checks on the final commit

| Check                                                                      | Result                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier on tracked files, `pnpm typecheck`, `pnpm integrations:typecheck` | Pass                                                                                                                                                                                                                                                                                                                              |
| `pnpm test`                                                                | 8 files, 138 tests pass                                                                                                                                                                                                                                                                                                           |
| `pnpm integrations:test`                                                   | 16 files, 116 tests pass on Node.js 24 and on Node.js 22.13.0 (macOS)                                                                                                                                                                                                                                                             |
| Credential regression tests                                                | The two credential tests in `adversarial.spec.ts` fail when the same runtime is built against the previous engine (`03fa7f7`) and pass against `034a74c`                                                                                                                                                                          |
| `pnpm build`, `pnpm integrations:build` twice                              | No diff: `dist/` and both integration bundles are reproducible                                                                                                                                                                                                                                                                    |
| `npm pack` of the MCP package twice                                        | Byte-identical tarballs (SHA-256 `d1cab977…`)                                                                                                                                                                                                                                                                                     |
| Action vs skill                                                            | Same readiness score, all 13 category scores, context score, grade, and issue count on 27 repositories and fixtures                                                                                                                                                                                                               |
| Credential sweep                                                           | Four synthetic credentials (a GitHub token, an AWS key id, a second GitHub token, and a configured MCP `env` value) absent from the action's log, summary, and outputs, the plugin's skill JSON and Markdown, and every MCP tool result including `include_raw`. The same sweep finds 21 leaks in the previous commit's artifacts |
| GitHub CI                                                                  | Passed on `0b4cc20`: build and tests, the action run on this repository, integrations on Node.js 22.13.0 and 24, and CodeQL                                                                                                                                                                                                       |

The credential sweep is regression evidence for known credential shapes, not proof that no secret
can appear in a report. Detection is pattern-based: a credential in an unrecognised format, file
paths, and the other cases under "Best effort or not masked" in
[SECURITY-FINDINGS.md](SECURITY-FINDINGS.md) are shown as written.

### Runtime redaction after the engine update

The engine masks every issue's `message`, `recommendation`, and `evidence`. The integrations runtime
no longer repeats that pass; it masks only the issue `id`, which the engine leaves as written and
which can carry a link target. It keeps its own `.acdrc` link check, which refuses the link before
the engine opens anything and names no absolute path. The integration tests check every field for
planted credentials, so an engine update that dropped its masking would fail CI.

## Blocked by external requirements

| Item                       | Blocker                                                                   | Owner action                                                                       |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Official MCP Registry      | Requires the npm package to be published first                            | `npm publish`, then `mcp-publisher login github` and `mcp-publisher publish`       |
| npm provenance             | npm generates it only from CI; no publish workflow exists                 | Optional: add one (`RELEASE-CHECKLIST.md` § 4)                                     |
| Guild.ai Agent Hub         | Sandbox cannot run the engines; no workflow dispatch or artifact download | None now; revisit per `docs/integrations/GUILD-FEASIBILITY.md`                     |
| agent-hub.dev              | No submission mechanism                                                   | Recheck later                                                                      |
| Anthropic plugin directory | Paid claude.ai plan                                                       | Submit at <https://claude.ai/directory/manage> (the Claude Code live check passed) |
| Glama, mcpserver.dev       | Need the published package                                                | Submit after npm publish                                                           |

## Remaining blockers

| Blocker                     | Severity                    | Evidence                                  | Owner action                                                           |
| --------------------------- | --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Integrations release branch | Release gate                | Two permission fixes from the live run    | Review and merge it, then tag `integrations-v0.1.0`                    |
| Cursor plugin               | Release gate for Cursor     | Not tested                                | `RELEASE-CHECKLIST.md` § 3 before submitting to the Cursor Marketplace |
| Windows                     | Only if listed as supported | Not tested                                | Run the skill script and the MCP server once, or keep Windows unlisted |
| npm publish, MCP Registry   | Owner steps                 | Package and `server.json` ready and valid | `RELEASE-CHECKLIST.md` § 4                                             |
