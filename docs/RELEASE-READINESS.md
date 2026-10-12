# Release readiness

Status on 2026-10-12, after agent-context-doctor#74 was merged and `vendor/agent-context-doctor`
moved to its merge commit `034a74c`. Nothing has been published, tagged, or submitted.

## Verdict

**Ready to merge after review. Not ready to publish:** the live-client checks below are owner
steps that have not been run. No automated check is failing and no security finding is open apart
from D (dev-only, see [SECURITY-FINDINGS.md](SECURITY-FINDINGS.md)).

## Engines

| Engine               | Commit    | Upstream                                                                                       |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| agent-readiness-kit  | `f15924b` | `main`, agent-readiness-kit#33                                                                 |
| agent-context-doctor | `034a74c` | `main`, merge commit of agent-context-doctor#74; contains `d40fbb2` and `d434560` from that PR |

`integrations/src/runtime/provenance.generated.ts`, the skill script header, and the MCP bundle
header name both commits.

## What changes for GitHub Action users

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

## Automated checks on the final commit

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
| GitHub CI                                                                  | Linux, Node.js 22.13.0 and 24; see the pull request checks for the final commit                                                                                                                                                                                                                                                   |

## Runtime redaction after the engine update

The engine masks every issue's `message`, `recommendation`, and `evidence`. The integrations runtime
no longer repeats that pass; it masks only the issue `id`, which the engine leaves as written and
which can carry a link target. It keeps its own `.acdrc` link check, which refuses the link before
the engine opens anything and names no absolute path. The integration tests check every field for
planted credentials, so an engine update that dropped its masking would fail CI.

## Not verified (owner steps; none were run)

| Check                                                                                                          | Why it cannot run here                                                            | Steps                       |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| Claude Code live session: `/agent-readiness:audit`, `${CLAUDE_PLUGIN_ROOT}` substitution, no permission prompt | Needs a logged-in interactive session; headless sessions could not authenticate   | `RELEASE-CHECKLIST.md` § 3  |
| Cursor loading the plugin and running the command                                                              | Cursor is not installed on the build machine                                      | `RELEASE-CHECKLIST.md` § 3  |
| MCP server inside a live host (Claude Code, Cursor)                                                            | Same as above; tested only with the official client SDK and the MCP Inspector CLI | `RELEASE-CHECKLIST.md` § 3  |
| Windows                                                                                                        | No Windows machine or CI job                                                      | Run once, or do not list it |
| Codex and other skill clients                                                                                  | Not installed                                                                     | Optional                    |

## Blocked by external requirements

| Item                       | Blocker                                                                   | Owner action                                                                 |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Official MCP Registry      | Requires the npm package to be published first                            | `npm publish`, then `mcp-publisher login github` and `mcp-publisher publish` |
| npm provenance             | npm generates it only from CI; no publish workflow exists                 | Optional: add one (`RELEASE-CHECKLIST.md` § 4)                               |
| Guild.ai Agent Hub         | Sandbox cannot run the engines; no workflow dispatch or artifact download | None now; revisit per `docs/integrations/GUILD-FEASIBILITY.md`               |
| agent-hub.dev              | No submission mechanism                                                   | Recheck later                                                                |
| Anthropic plugin directory | Paid claude.ai plan                                                       | Submit at <https://claude.ai/directory/manage> after the live check          |
| Glama, mcpserver.dev       | Need the published package                                                | Submit after npm publish                                                     |

## Remaining blockers

| Blocker            | Severity                   | Evidence        | Owner action                                                                                  |
| ------------------ | -------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Live-client checks | Release gate, not a defect | Not run         | `RELEASE-CHECKLIST.md` § 3, before publishing the plugin or the MCP package                   |
| Action release     | Process                    | `dist/` changes | After merge, release a new action version and note the two runtime changes above in its notes |
