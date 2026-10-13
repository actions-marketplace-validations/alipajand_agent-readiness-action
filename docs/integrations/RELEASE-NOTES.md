# Integrations release notes

The skill, the Claude Code and Cursor plugin, and the MCP server are released together under
`integrations-v<version>` tags. Those tags are independent of the GitHub Action's `v` tags.

## 0.1.2 (unreleased)

A coordinated release of every integration, for directory compatibility. The audit engines, their
commits (agent-readiness-kit `f15924b`, agent-context-doctor `034a74c`), scoring, and the MCP
server's behavior are unchanged; the MCP package and its registry entry move to 0.1.2 only because
all integrations share one version.

### Changed

- The plugin folder has a `README.md`: purpose, installation, components, engine provenance,
  Node.js requirement, what runs locally and what the AI client may send to its model provider,
  masking limits, and tested clients. Anthropic's plugin directory requires one.
- The Cursor manifest validates against Cursor's published plugin schema: `author` no longer has a
  `url`, which the schema does not allow, and it gains `displayName`.
- The Cursor command has `name` and `description` front matter and its own fail-closed rule: if the
  script is denied or fails before printing a report, the model says the audit did not run, gives no
  scores or findings, does not claim success, and does not read the repository's files instead.
  Before, the Cursor command relied on the skill for that rule.

### Tests

- Both Cursor manifests are checked against snapshots of Cursor's schemas (`cursor/plugins` at
  `fe53d9e`).
- The Cursor command's front matter and fail-closed rule, and the plugin README's required
  disclosures, are checked. Each new test fails on the 0.1.1 files.

### Not tested

Cursor itself (not installed on the build machine), Windows, and Claude Code's interactive
permission prompts.

## 0.1.1 (2026-10-12)

Tag `integrations-v0.1.1` (merge commit `30e26e1`); [GitHub release](https://github.com/alipajand/agent-readiness-action/releases/tag/integrations-v0.1.1). The MCP package is
on npm as [`@alipajand/agent-readiness-mcp@0.1.1`](https://www.npmjs.com/package/@alipajand/agent-readiness-mcp) and listed in the
[MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.alipajand/agent-readiness) as `io.github.alipajand/agent-readiness` 0.1.1.

First release. It packages the same pinned engines as agent-readiness-action v1.2.0 for local
use by AI coding agents: read-only, offline scanning with no LLM scoring.

Version 0.1.0 was never tagged or published, but the plugin was installable from `main` at 0.1.0
before the fixes below. Claude Code updates an installed plugin only when its version changes, so
the first release is 0.1.1.

| Component                                        | Version | Where                                                                                                                                                                                                                                                                     | Status                                                     |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Agent Skill `agent-readiness-audit`              | 0.1.1   | `plugins/agent-readiness/skills/agent-readiness-audit/`; `npx skills add alipajand/agent-readiness-action`                                                                                                                                                                | Tested in Claude Code                                      |
| Claude Code plugin `agent-readiness`             | 0.1.1   | `claude plugin marketplace add alipajand/agent-readiness-action`, then `claude plugin install agent-readiness@agent-readiness`                                                                                                                                            | Tested in Claude Code                                      |
| MCP server `@alipajand/agent-readiness-mcp`      | 0.1.1   | [npm](https://www.npmjs.com/package/@alipajand/agent-readiness-mcp): `npx -y @alipajand/agent-readiness-mcp@0.1.1`; [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.alipajand/agent-readiness): `io.github.alipajand/agent-readiness` | Tested with Claude Code as host                            |
| Cursor plugin (same `agent-readiness` directory) | 0.1.1   | Local install only (`~/.cursor/plugins/local/`)                                                                                                                                                                                                                           | **Not tested in Cursor; not submitted to the Marketplace** |

Engines: agent-readiness-kit `f15924b` and agent-context-doctor `034a74c`. Every report and bundle
header names both commits.

### Requirements

- Skill and plugin: Node.js 22.12 or later.
- MCP server: Node.js 22.13 or later (23.5 or later on Node.js 23). It refuses to start on older
  releases, because audits run in a worker confined by Node's permission model.

### What it does

- `audit` scores a repository's readiness for AI coding agents (agent-readiness-kit) and checks its
  agent instruction and configuration files (agent-context-doctor), with the engines' own scores
  and findings.
- The MCP server offers `audit_repository`, `audit_agent_context`, and `get_audit_report` (paged,
  with the engines' raw JSON on request), restricted to the directories given with `--root`.
- The scanner writes nothing to the audited repository, makes no network request, and never runs
  the repository's own scripts. Recognised credentials are masked in its output; see
  `docs/SECURITY-FINDINGS.md` for what masking does and does not guarantee.

### The scanner is offline; the AI client is not

The skill script and the MCP server are deterministic and make no network requests. The AI client
that runs them reads the results and may send them to its model provider. It may also read the
repository's files directly and send those. Credential masking covers the scanner's output only.
See `docs/integrations/SECURITY-MODEL.md`.

### How to invoke it

The tested path in Claude Code is invoking the audit by name: `/agent-readiness:audit [path]`,
`/agent-readiness:agent-readiness-audit`, or `/agent-readiness-audit` for the standalone skill.
Asking in plain words relies on the client loading the skill by itself, which is not verified as
reliable: in a headless session Claude Code denied that `Skill` call and the model read the files
itself. If the script cannot run, the command and the skill now tell the model to say the audit did
not run instead of giving scores or reviewing the files itself. An answer without the engines'
scores and commits means the audit did not run.

### Fixed before release

Found in live Claude Code sessions and fixed with regression tests:

- `/agent-readiness:audit` made the model call the `Skill` tool, which the command does not
  pre-approve, so Claude Code denied it. The command now needs only the bundled script.
- The skill showed its script as `<skill-dir>/scripts/…`, so the model built the path itself and the
  call no longer matched the pre-approved command. In Claude Code the skill now gives the exact
  command with `${CLAUDE_SKILL_DIR}`.

### Tested

- Claude Code 2.1.278, signed in, headless: the plugin command, the plugin's skill, the skill
  installed from GitHub with `npx skills add`, installation from the GitHub marketplace, and the
  packed MCP server as the session's MCP server.
- The skill's JSON equals `ark audit --json --no-history` and `acd audit --json` on 28 repositories
  and fixtures.
- Linux CI on Node.js 22.13.0 and 24; macOS locally on Node.js 22.13.0 and 24.

### Not tested

- Cursor (not installed on the build machine).
- Claude Code in an interactive session, and plain-language invocation of the skill.
- Windows.
- Codex and other skill clients.
