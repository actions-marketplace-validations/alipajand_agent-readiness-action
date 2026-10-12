# Implementation plan

Status of each stage. "Done" means implemented and covered by the tests named; anything that needs
an external account or a manual step in another application is listed separately.

## Stage 1: audit and architecture — done

- Inspected the action, both engines, their CLIs, configuration loading, and the submodule pins.
- Baseline on `2f9022d`: `pnpm format:check`, `pnpm typecheck`, `pnpm test` (138 tests), and
  `pnpm build` all passed, and the rebuilt `dist/` matched the committed bundle.
- Decided on a workspace package in this repository ([ARCHITECTURE.md](ARCHITECTURE.md)).
- Scaffolded `integrations/` (workspace package, build script, provenance generator, tests).
- Added `commander` and `picocolors` as root dev dependencies, at the versions the engines lock, so
  the parity tests can build each engine's own CLI from the submodules. They are not imported by
  the action and do not change `dist/`.

## Stage 2: shared runtime and portable skill — done

- Runtime: `integrations/src/runtime/` (path confinement, engine adapters, combined report,
  Markdown formatting, structured errors, provenance).
- CLI: `agent-readiness audit [path] --format json|markdown --only readiness|context`, `version`.
- Skill: `plugins/agent-readiness/skills/agent-readiness-audit/` with the committed bundle
  `scripts/agent-readiness.mjs` and its third-party license notices.
- Validation: `skills-ref validate` passes; the spec rules also run in CI (`tests/skill.spec.ts`).
- Tests: parity with `ark audit --json --no-history` and `acd audit --json` on seven fixtures;
  hostile repositories (injected instructions, secrets, bidi and zero-width characters, symlink
  escapes, malicious file names, oversized files); invalid `.acdrc`; read-only snapshots; clean
  installation under Node's permission model with writes denied.

## Stage 3: Claude Code and Cursor plugins — done (two manual client checks remain)

Done. See [PLUGINS.md](PLUGINS.md) for the plugin layout, verification evidence, and the publishing checklists.

## Stage 4: MCP server — done (live host checks remain)

Package `integrations/mcp-package/` (`@alipajand/agent-readiness-mcp` 0.1.0), three read-only
tools, sandboxed worker processes, `server.json` validated with `mcp-publisher`. Evidence and
remaining publication steps: [MCP-SERVER.md](MCP-SERVER.md).

## Stage 5: Guild.ai — deferred (documented no-go)

The Guild sandbox cannot run the engines and its GitHub tools cannot start a workflow or download an
artifact. No agent was built. Investigation, minimum viable design, and recommendation:
[GUILD-FEASIBILITY.md](GUILD-FEASIBILITY.md).

## Stage 6: distribution — done (owner publication steps remain)

Listing copy and accurate claims: [../distribution/README.md](../distribution/README.md). Status per
directory with evidence: [../PUBLISHING-MATRIX.md](../PUBLISHING-MATRIX.md). Release steps:
[../RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md). CI gained an `integrations` job (Node.js 22.13
and 24) that rebuilds and diffs the bundles, runs the tests, validates the skill with `skills-ref`,
and checks that `npm pack` is reproducible.

## Stage 7: release audit — done

Two independent reviews; one high and fifteen medium/low findings fixed with regression tests.
See [../FINAL-RELEASE-AUDIT.md](../FINAL-RELEASE-AUDIT.md), [../SECURITY-FINDINGS.md](../SECURITY-FINDINGS.md),
[../PLATFORM-COMPATIBILITY.md](../PLATFORM-COMPATIBILITY.md), and [../RELEASE-READINESS.md](../RELEASE-READINESS.md).
