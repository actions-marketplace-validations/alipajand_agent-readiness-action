# Integrations architecture

This document covers the portable integrations built around the same two audit engines the GitHub
Action bundles: a command-line runtime, an Agent Skill, Claude Code and Cursor plugins, and a local
MCP server. The GitHub Action itself is described in [../ARCHITECTURE.md](../ARCHITECTURE.md) and
is unchanged.

## Audit findings that shaped the design

The decisions below follow from inspecting the three repositories at these commits:

| Repository                   | Commit used                                    | Notes                                                                       |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| agent-readiness-action       | `2f9022d` (v1.1.0)                             | Bundles both engines with `@vercel/ncc` from git submodules                 |
| agent-readiness-kit (`ark`)  | `b490a30` (package version 1.0.0, unpublished) | `vendor/agent-readiness-kit`, matches upstream `main` at the time of audit  |
| agent-context-doctor (`acd`) | `d70de51` (package version 1.0.0, unpublished) | `vendor/agent-context-doctor`, matches upstream `main` at the time of audit |

1. **Neither engine is published under its own name.** The unscoped npm packages
   `agent-readiness-kit` and `agent-context-doctor` belong to unrelated maintainers
   (`connordibble` and `dadion123`). Installing them would run someone else's code. Every
   integration therefore builds the engines from the pinned submodules and never runs
   `npm install`, `npx`, or `pnpm dlx` for an engine.
2. **The engines' CLIs can write into the audited repository.** `ark audit` appends to
   `.ark-history.json` unless `--no-history` is passed, and both CLIs honor an `output` path from
   the audited repository's `.arkrc` or `.acdrc`. A repository being audited must not be able to
   make an audit write files, so the integrations call the engines' library entry points
   (`auditRepo`, `toAuditJson`, `loadConfig`) the same way the action does, and never their CLIs.
3. **The engines' library functions take a directory and return plain JSON.** Nothing in them
   depends on GitHub Actions. The action's own adapters (`src/runArk.ts`, `src/runDoctor.ts`) read
   `GITHUB_WORKSPACE` only to resolve relative paths.
4. **The action's committed bundle (`dist/index.js`) cannot be reused.** It is an Actions entry
   point: it reads `INPUT_*` variables, writes workflow commands, and calls the GitHub API. The
   integrations bundle the engines separately from the same submodules, so both artifacts always
   carry the same engine commits.
5. **Both engines run on Node.js 22.12 or later** and use only `node:` built-ins plus `fast-glob`
   and `zod`, which bundle cleanly. The bundled runtime imports `node:fs`, `node:fs/promises`,
   `node:path`, `node:util`, `node:crypto`, and `node:module`, and nothing that opens a network
   connection or starts a process.

## Decision: one repository, an `integrations/` workspace package

The integrations live in this repository rather than a new `agent-readiness-integrations`
repository.

- **One set of engine pins.** The action and every integration build from the same
  `vendor/` submodules, so a bump (the `bumping-bundled-engines` skill or a Dependabot PR)
  updates everything in one reviewed change, and CI checks all committed bundles together.
- **No second release pipeline for the engines.** A separate repository would need its own
  submodules, bump automation, and drift checks for no technical gain.
- **The action's public contract is untouched.** `action.yml`, `src/`, and `dist/` do not change.
  The integration code is a separate workspace package that the action's build never imports.

A separate repository would become worthwhile if the integrations needed a release cadence or
access controls that conflict with the action's tags (for example, if marketplace reviewers
require a repository containing only the plugin). Nothing found during the audit requires that.

## Layout

| Path                                                    | Role                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `integrations/src/runtime/`                             | Shared runtime: path confinement, engine adapters, combined report, Markdown      |
| `integrations/src/cli.ts`                               | `agent-readiness` command-line entry point                                        |
| `integrations/src/mcp/`                                 | Local MCP server (stdio)                                                          |
| `integrations/scripts/build.mjs`                        | Builds the committed bundles and writes engine provenance                         |
| `integrations/scripts/provenance.mjs`                   | Reads the submodule commits; fails when a submodule is not at its recorded commit |
| `integrations/tests/`                                   | Runtime, CLI, parity, adversarial, packaging, and MCP tests                       |
| `plugins/agent-readiness/`                              | The plugin directory shared by Claude Code and Cursor                             |
| `plugins/agent-readiness/skills/agent-readiness-audit/` | The portable Agent Skill, with its bundled script                                 |
| `integrations/mcp-package/`                             | The publishable MCP server package                                                |

## How a scan runs

```text
agent (skill, plugin command, or MCP tool)
  └─ node scripts/agent-readiness.mjs audit <dir> --format json      (skill and plugins)
  └─ MCP tool call → child process: node audit-worker.mjs audit <dir> (MCP server)
        └─ resolveTarget: realpath, must be a directory, must sit inside an authorized root
        └─ runReadiness: kit auditRepo → toAuditJson        (same JSON as `ark audit --json`)
        └─ runContext:   doctor loadConfig(.acdrc rules) → auditRepo (same JSON as `acd audit --json`)
        └─ CombinedReport { engines provenance, readiness outcome, context outcome }
```

Each engine's result is kept exactly as the engine produced it. The runtime adds ordering for the
Markdown view (context issues high → low; readiness checks `fail` before `warn`, then by missing
points) but never changes a score, adds a finding, or assigns a severity the engine did not give.
When an engine fails, its section carries an error code and message and no score.

## Engine provenance

`integrations/scripts/build.mjs` writes `src/runtime/provenance.generated.ts` from the checked-out
submodules (name, `package.json` version, full commit SHA, repository URL) and stamps the same
information in a header comment on each bundle. `agent-readiness version` prints it, and every
report includes it under `engines`. The engines' `package.json` version is still `1.0.0` while the
pins are later commits, so the commit SHA is the authoritative identifier.

## Build and release

- `pnpm integrations:build` rebuilds the bundles. Like `dist/`, they are committed, and CI fails
  when a rebuild changes them.
- The bundles contain the engines and their dependencies, so the skill and the MCP package have no
  runtime dependencies to install.
- Versions: the runtime and MCP server start at `0.1.0` (`integrations/src/runtime/version.ts`),
  independent of the action's `v1` tags. Integration releases use `integrations-v<semver>` tags so
  they never move the action's floating `v1` tag.
