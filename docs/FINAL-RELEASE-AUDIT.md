# Final release audit: integrations

Review date 2026-10-12. Scope: everything added for the portable integrations (`integrations/`,
`plugins/agent-readiness/`, marketplace manifests, `integrations/mcp-package/`, the CI job, and the
docs), plus the GitHub Action's backward compatibility. The review did not take earlier
stages on trust: two independent reviewers inspected the code and exercised the built artifacts,
and every claim below was re-run at the end.

A later reconciliation review on the same day corrected this document where the branch had moved
on: the engine update changed the action's `dist/`, `agent-context-doctor#74` became a release
dependency, and its masking had a quadratic case. Current status, blockers, and evidence are in
[RELEASE-READINESS.md](RELEASE-READINESS.md); findings are in
[SECURITY-FINDINGS.md](SECURITY-FINDINGS.md).

## Result

No critical or high findings remain open in the integrations. One high finding (credentials in
non-secret evidence) and fifteen medium and low findings were fixed with regression tests. Open
items are pre-existing issues in the engines and the action, listed in
[SECURITY-FINDINGS.md](SECURITY-FINDINGS.md). Publication is owner-controlled and has not happened.

## Validation run (final)

| Check                                                                                                          | Result                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                            | Pass                                                                                  |
| `pnpm typecheck`                                                                                               | Pass                                                                                  |
| `pnpm test:coverage` (action)                                                                                  | 8 files, 138 tests pass; 99.69% statements, 97.35% branches, 100% functions and lines |
| `pnpm build` (action)                                                                                          | Rebuilt `dist/` identical to the committed one                                        |
| `pnpm integrations:typecheck`                                                                                  | Pass                                                                                  |
| `pnpm integrations:build` twice                                                                                | Identical bundles (idempotent); no absolute paths embedded                            |
| `pnpm integrations:test`                                                                                       | 16 files, 112 tests pass                                                              |
| `skills-ref validate` (agentskills `69ef37e`)                                                                  | Valid skill                                                                           |
| `claude plugin validate --strict plugins/agent-readiness` and `claude plugin validate .` (Claude Code 2.1.278) | Pass                                                                                  |
| `mcp-publisher validate` (1.8.1, checksum verified)                                                            | `server.json` is valid                                                                |
| `npm pack` twice                                                                                               | Byte-identical tarballs                                                               |
| `pnpm audit`                                                                                                   | 2 advisories, both pre-existing (`braces` via the engines, `nanoid` in test tooling)  |

## Review areas

| #   | Area                                 | Finding                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Architecture and duplicated logic    | One runtime; the MCP worker is a byte-identical copy of the skill script (tested). The engines are called, not reimplemented. The only added logic is ordering, formatting, path confinement, and credential redaction through the doctor's own redactor.                      |
| 2   | Engine provenance                    | Commits generated from the submodules; the build refuses to run when a submodule is not at its recorded commit; every report and bundle header names both commits (`provenance.spec.ts`).                                                                                      |
| 3   | Reproducible builds and supply chain | Frozen lockfile; bundles idempotent and diffed in CI; `npm pack` reproducible; the MCP SDK pinned to 2.2.0 (oldest-safe release ≥ 14 days); CI actions pinned by SHA; `skills-ref` dependencies pinned by hash.                                                                |
| 4   | Runtime dependency trust             | The skill script and the npm package have no runtime dependencies. The unrelated npm packages named `agent-readiness-kit` and `agent-context-doctor` are never installed.                                                                                                      |
| 5   | Permission scope                     | The plugin pre-approves one command (the bundled script). No hooks, MCP servers, or executables on `PATH`. MCP tools are annotated read-only. The Guild design (not built) used read-only GitHub tools.                                                                        |
| 6   | Filesystem isolation and symlinks    | Realpath before root checks; lexical check first; canonical re-check in the worker; `.acdrc` links leaving the repository refused; engines skip outside links (tested with file, directory, and loop links).                                                                   |
| 7   | Shell and command injection          | No shell anywhere; worker started with an argument vector; paths after `--`; directories named `--format`, `-h`, `--require=…` audited as paths.                                                                                                                               |
| 8   | Malicious instruction files          | Reported as findings, never followed; skill, command, and tool descriptions say so.                                                                                                                                                                                            |
| 9   | Sensitive information                | Credentials redacted in all issue text; worker gets an empty environment; no contents outside the repository reach output (tested).                                                                                                                                            |
| 10  | MCP input and protocol               | Schema validation by the SDK, bounded strings and pages, 32 MB worker output cap, 1 MB raw cap, time limit, concurrency limit with `BUSY`, stdout carries only JSON-RPC (tested on the raw stream).                                                                            |
| 11  | Guild trust boundaries               | Not built. The feasibility document records the pull-request workflow-tampering risk that rules out reading results from arbitrary runs.                                                                                                                                       |
| 12  | Plugin lifecycle                     | Self-contained directory, no symlinks; install from a git marketplace into an empty config copied all files; nothing runs at install or startup.                                                                                                                               |
| 13  | Network and telemetry                | No networking module in any bundle (tested on the built files). The `skills` CLI used for installation has its own telemetry; documented with the opt-out.                                                                                                                     |
| 14  | Publishing and updates               | Owner-only steps in `RELEASE-CHECKLIST.md`; versions kept in lockstep by tests; plugin `version` must be bumped for users to update.                                                                                                                                           |
| 15  | Platform specifications              | Checked against current docs; see [PLATFORM-COMPATIBILITY.md](PLATFORM-COMPATIBILITY.md).                                                                                                                                                                                      |
| 16  | Test coverage                        | 112 integration tests: parity, sandbox parity, adversarial, read-only snapshots, clean installs (skill under the permission model, npm tarball offline), MCP protocol, packaging.                                                                                              |
| 17  | Documentation accuracy               | Corrected during review: test counts, the "no process modules" claim, the redaction claims, the parity statement, and a missing referenced file. Point-in-time observations are dated.                                                                                         |
| 18  | Action backward compatibility        | `action.yml` and `src/` unchanged; inputs and outputs unchanged; 138 tests pass. `dist/` changes only through the engine updates: same output on Linux, and on macOS and Windows runners fixed-name lookups now match case exactly (CHANGELOG). The README gained one section. |

## Adapter equivalence

For the same engine commits: the skill's JSON equals `ark audit --json --no-history` and
`acd audit --json` on seven fixtures; the sandboxed worker's output equals the unsandboxed output
(including for a nested subdirectory); MCP `include_raw` equals the skill's JSON for both engines;
and the plugin's cached copy of the bundle is byte-identical to the repository's. The independent
reviewer reproduced the skill, engine, and MCP equality on its own test repositories. The GitHub
Action uses the same engine commits through its own adapters: run locally from the committed
`dist/index.js` with `context-audit: true`, it reports readiness 99 and context 100 (excellent, 0
issues) for this repository, the same as the skill.

## Smallest changes still required for a safe public release

1. Push the branch and let the new CI job pass on Linux (Node 22.13 and 24).
2. Run the two manual client checks (Claude Code live session, Cursor local plugin).
3. Decide on open finding A (the action's `.acdrc` symlink handling); the upstream fix also
   covers the integrations' guard.

Everything else in the open list is pre-existing and does not block the integrations release.
