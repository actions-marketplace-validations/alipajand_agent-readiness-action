# Release readiness

Status on 2026-10-12, after the reconciliation review of this branch and agent-context-doctor#74.
Nothing has been merged, published, tagged, or submitted.

## Verdict

**BLOCKED** on one dependency: agent-context-doctor#74 must be merged and `vendor/agent-context-doctor`
moved to its merge commit. That pull request fixes security findings A, B, E, and F
([SECURITY-FINDINGS.md](SECURITY-FINDINGS.md)), which affect the released action as well as the
integrations. Everything else on this branch is done and verified, apart from the live-client checks
listed below, which are owner steps.

## What changes for GitHub Action users

`action.yml`, `src/`, the inputs, the outputs, and the comment format are unchanged. `dist/index.js`
and `dist/licenses.txt` change because both engines moved to `tinyglobby` (agent-readiness-kit
`b490a30` → `f15924b`, agent-context-doctor `d70de51` → `03fa7f7`):

| Area                      | Runtime effect                                                                                                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bundled packages          | `fast-glob`, `braces`, `micromatch`, and their dependencies leave `dist/`; `tinyglobby` and `fdir` enter. No network or new runtime capability                                                                                                                  | `dist/licenses.txt` diff                                                                                                                                                                                                                   |
| Linux runners             | No change in scores, findings, logs, summaries, or outputs                                                                                                                                                                                                      | `main` and this branch's `dist/` run side by side: identical on 21 local repositories and on a fixture of symlinks (file, directory, `/`), brace patterns in `.acdrc`, mixed-case names, and deep nesting, also on a case-sensitive volume |
| macOS and Windows runners | Fixed-name lookups in the readiness engine (`README.md`, `CHANGELOG.md`, `package.json`, `.tool-versions`, …) now match case exactly, as on Linux. `Readme.md` no longer counts as `README.md` for the documentation checks                                     | Same comparison on a case-insensitive volume: the mixed-case fixture scored 37 instead of 38                                                                                                                                               |
| Root dependencies         | `fast-glob` replaced by `tinyglobby` (bundled). `commander` and `picocolors` added as pinned dev dependencies so the tests can build the engines' own CLIs for parity checks; the integrations workspace adds the MCP SDK, `zod`, and `ajv`. None reach `dist/` | `package.json`, `pnpm-lock.yaml`                                                                                                                                                                                                           |

Once agent-context-doctor#74 is in, the action also stops printing recognised credentials quoted by
non-secret findings in its log (finding B), and refuses an `.acdrc` that links outside the
repository (finding A). Baseline fingerprints change only for findings whose message or evidence
contained a credential. The dry run below confirmed both on this branch.

## Dry run of the required engine bump

`vendor/agent-context-doctor` moved locally to `d434560` (agent-context-doctor#74 plus the redaction
fix), with every artifact regenerated. Not pushed: the release must pin the merge commit instead.

| Check                                                       | Result                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm test`, `pnpm build`                 | Pass; 138 tests; `dist/index.js` regenerated                                                                            |
| `pnpm integrations:build`, `pnpm integrations:test`         | Pass; 116 tests, after updating `adversarial.spec.ts` (the engine now masks, so the runtime's own redaction count is 0) |
| `provenance.generated.ts` and bundle headers                | Name `d434560` and `f15924b`                                                                                            |
| Action vs skill on 8 repositories                           | Same readiness score, context score, and issue count on each                                                            |
| Credentials in the action's log, summary, and outputs       | 0 occurrences (3 lines on `main` and on this branch today)                                                              |
| Configured credential in a one-line `.mcp.json` (finding F) | Absent from the skill's JSON and Markdown and from MCP output                                                           |

## Implemented and verified

- Skill, CLI, Claude Code and Cursor plugin, and MCP server, as listed in
  [FINAL-RELEASE-AUDIT.md](FINAL-RELEASE-AUDIT.md).
- MCP server requires Node.js 22.13+ (23.5+ on Node.js 23) and refuses to start otherwise, instead
  of running workers without the read-only sandbox.
- Issue ids and recommendations go through the credential redactor, with message and evidence.
- Generated files reproduce: `dist/` and both integration builds are identical after rebuilding;
  two `npm pack` runs give byte-identical tarballs; provenance and bundle headers match the
  submodule commits.
- Linux: CI runs the action, its tests, and the integration suite on Node.js 22.13.0 and 24 for
  every push (see the pull request checks for the final commit). Node.js 22.13.0 on macOS: the MCP,
  worker, parity, and adversarial suites pass locally.

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

| Blocker                            | Severity                   | Evidence                                                                       | Owner action                                                                                                                                           |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| agent-context-doctor#74 not merged | Medium                     | Findings A, B, E, F reproduced on `main` and this branch; fixed in the dry run | Review and merge it, then move the submodule to the merge commit with the `bumping-bundled-engines` skill and commit the dry run's test change with it |
| Live-client checks                 | Release gate, not a defect | Not run                                                                        | `RELEASE-CHECKLIST.md` § 3                                                                                                                             |
| Action release                     | Process                    | `dist/` changes                                                                | Release a new action version after merge                                                                                                               |
