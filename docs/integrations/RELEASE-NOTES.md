# Integrations release notes

The skill, the Claude Code and Cursor plugin, and the MCP server are released together under
`integrations-v<version>` tags. Those tags are independent of the GitHub Action's `v` tags.

## 0.1.0 (unreleased)

First release. It packages the same pinned engines as agent-readiness-action v1.2.0 for local
use by AI coding agents: read-only, offline, and with no LLM scoring.

| Component                                       | Version | Where                                                                                                                          |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Agent Skill `agent-readiness-audit`             | 0.1.0   | `plugins/agent-readiness/skills/agent-readiness-audit/`; `npx skills add alipajand/agent-readiness-action`                     |
| Claude Code and Cursor plugin `agent-readiness` | 0.1.0   | `claude plugin marketplace add alipajand/agent-readiness-action`, then `claude plugin install agent-readiness@agent-readiness` |
| MCP server `@alipajand/agent-readiness-mcp`     | 0.1.0   | npm (not yet published); MCP Registry name `io.github.alipajand/agent-readiness`                                               |

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
- Nothing is written to the audited repository, no network request is made, and the repository's
  own scripts are never run. Recognised credentials are masked in findings; see
  `docs/SECURITY-FINDINGS.md` for what masking does and does not guarantee.

### Fixed before release

Found in live Claude Code sessions and fixed with regression tests:

- `/agent-readiness:audit` made the model call the `Skill` tool, which the command does not
  pre-approve, so Claude Code denied or prompted for it. The command now needs only the bundled
  script.
- The skill showed its script as `<skill-dir>/scripts/…`, so the model built the path itself and the
  call no longer matched the pre-approved command. In Claude Code the skill now gives the exact
  command with `${CLAUDE_SKILL_DIR}`.

### Tested

- Claude Code 2.1.278, signed in: the plugin command, the plugin's skill, the skill installed from
  GitHub with `npx skills add`, installation from the GitHub marketplace, and the packed MCP server
  as a host's MCP server.
- The skill's JSON equals `ark audit --json --no-history` and `acd audit --json` on 28 repositories
  and fixtures.
- Linux CI on Node.js 22.13.0 and 24; macOS locally on Node.js 22.13.0 and 24.

### Not tested

- Cursor (not installed on the build machine).
- Windows.
- Codex and other skill clients.
