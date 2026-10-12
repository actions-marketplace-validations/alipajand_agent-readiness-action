# Claude Code and Cursor plugins

One plugin directory, `plugins/agent-readiness/`, serves both clients:

```text
plugins/agent-readiness/
├── .claude-plugin/plugin.json      Claude Code manifest
├── .cursor-plugin/plugin.json      Cursor manifest (skills + Cursor command)
├── skills/agent-readiness-audit/   The portable skill and its bundled script
├── commands/audit.md               Claude Code command: /agent-readiness:audit
├── cursor-commands/agent-readiness-audit.md   Cursor command
├── assets/logo.svg
└── LICENSE
```

The repository root carries the marketplace files that list it: `.claude-plugin/marketplace.json`
and `.cursor-plugin/marketplace.json`.

The plugin adds no hooks, no MCP servers, and no executables on `PATH`, so nothing runs until you
ask for an audit. The only pre-approved command is the bundled audit script:
`Bash(node ${CLAUDE_PLUGIN_ROOT}/skills/agent-readiness-audit/scripts/agent-readiness.mjs *)` for
the command and `Bash(node ${CLAUDE_SKILL_DIR}/scripts/agent-readiness.mjs *)` for the skill. No
API key or external LLM is used by the audit.

## Claude Code

### Install

```bash
claude plugin marketplace add alipajand/agent-readiness-action
```

```bash
claude plugin install agent-readiness@agent-readiness
```

Inside a session the same steps are `/plugin marketplace add alipajand/agent-readiness-action` and
`/plugin install agent-readiness@agent-readiness`.

### Use

- `/agent-readiness:audit [path]`: run the audit on a path (default: the current directory). This
  is the tested path: it runs the bundled script once without a permission prompt.
- `/agent-readiness:agent-readiness-audit`: the skill, invoked by name. Also tested.
- Asking in plain words relies on Claude loading the skill by itself, which is not verified as
  reliable: in a headless session the `Skill` tool call was denied and the model read the files
  itself. An answer without the engines' scores and commits means the audit did not run.

The scanner is offline; Claude is not. Claude reads the report and may send it, and any files it
reads itself, to its model provider ([SECURITY-MODEL.md](SECURITY-MODEL.md#offline-scanner-ai-client)).

### Local development

```bash
claude --plugin-dir ./plugins/agent-readiness
```

```bash
claude plugin validate --strict plugins/agent-readiness
```

```bash
claude plugin validate .
```

## Cursor

**Not tested in Cursor yet.** The manifests follow Cursor's plugin reference and are checked by
`plugins.spec.ts`, but the plugin has not been loaded in Cursor, so it is not submitted to the
Cursor Marketplace.

### Install

After the plugin is listed: install **Agent Readiness** from the Cursor Marketplace.

Before that, or for local development, copy the directory (do not symlink it, because Cursor skips
symlinked plugins):

```bash
cp -R plugins/agent-readiness ~/.cursor/plugins/local/agent-readiness
```

Then run **Developer: Reload Window** and check **Customize** for the `agent-readiness-audit` skill
and the `agent-readiness-audit` command. Team and Enterprise admins control local plugins with
**Allow Local Plugin Imports**.

### Use

Run the `agent-readiness-audit` command, or ask the agent to audit the repository's agent
readiness. Cursor expands `${CLAUDE_PLUGIN_ROOT}` only in MCP configuration, so the Cursor command
hands off to the skill, which locates its own script.

## Verification evidence

| Check                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude plugin validate .` (marketplace), Claude Code 2.1.278                                                       | Passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `claude plugin validate --strict plugins/agent-readiness`                                                           | Passed, no warnings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `skills-ref validate` on the skill (agentskills `69ef37e`)                                                          | Valid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Install from a git marketplace into an empty `CLAUDE_CONFIG_DIR`                                                    | Installed `agent-readiness@agent-readiness` 0.1.0, copied to `plugins/cache/agent-readiness/agent-readiness/0.1.0/` with all ten files                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cached bundle compared with the repository bundle                                                                   | Byte-identical; audit output identical                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Manifest, path, symlink, permission, and license rules (`integrations/tests/plugins.spec.ts`)                       | Passing in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Read-only scans (`tests/readOnly.spec.ts`, `tests/install.spec.ts` with writes denied)                              | Passing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Missing prerequisite: Node.js older than 22.12                                                                      | The script prints `agent-readiness needs Node.js 22.12 or later; this is Node.js <version>.` and exits 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Live session (Claude Code 2.1.278, signed in, headless) expanding `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` | Passed on 2026-10-12. `/agent-readiness:audit` (with a path and without one) and `/agent-readiness:agent-readiness-audit` each ran the bundled script once with the variable expanded, with no permission denial, and reported the engines' scores (readiness 31, context 0 risky, 27 issues on the credential fixture). Two defects found in the first run are fixed in this release: the command sent the model to the `Skill` tool, which was denied, and the skill showed only a `<skill-dir>` placeholder, so the model quoted the script path and the call was denied |
| Cursor load from `~/.cursor/plugins/local/`                                                                         | **Not tested**: Cursor is not installed on the build machine. On the release checklist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Marketplace metadata

| Field             | Value                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | `agent-readiness`                                                                                                                                                                                    |
| Display name      | Agent Readiness                                                                                                                                                                                      |
| Short description | Score a repository's readiness for AI coding agents and check AGENTS.md, CLAUDE.md, Cursor rules, and MCP config for quality and safety problems. Deterministic, read-only, offline; no LLM scoring. |
| Category          | Development                                                                                                                                                                                          |
| Keywords          | ai-coding-agents, agent-readiness, repository-readiness, agents-md, claude-md, cursor-rules, quality-gate, security-audit                                                                            |
| License           | MIT                                                                                                                                                                                                  |
| Repository        | <https://github.com/alipajand/agent-readiness-action>                                                                                                                                                |
| Logo              | `plugins/agent-readiness/assets/logo.svg`                                                                                                                                                            |

## Cursor publishing checklist

Owner actions are marked ☐ and happen outside this repository.

- [x] `.cursor-plugin/plugin.json` with a unique kebab-case `name`
- [x] `.cursor-plugin/marketplace.json` at the repository root with unique plugin names
- [x] All manifest paths relative, inside the plugin, no `..` (tested)
- [x] Logo committed and referenced by relative path
- [x] No `mcp.json`, so no undeclared variables
- [x] README documentation of usage and configuration (this page and `SKILL-USAGE.md`)
- [x] Open-source license (MIT) inside the plugin directory
- ☐ Load the plugin from `~/.cursor/plugins/local/agent-readiness`, run the command on a sample
  repository, and confirm the skill finds `scripts/agent-readiness.mjs`
- ☐ Push the release commit and tag, keeping the repository public
- ☐ Submit <https://github.com/alipajand/agent-readiness-action> at
  <https://cursor.com/marketplace/publish> (every version is reviewed by hand)

## Claude Code distribution checklist

- [x] `claude plugin validate --strict` passes for the plugin; `claude plugin validate .` passes
      for the marketplace
- [x] Name does not start with `claude-` or `anthropic-`
- [x] Plugin is self-contained (no symlinks, nothing referenced outside its directory)
- [x] `version` set in `plugin.json`; bump it with every release or users will not receive updates
- [x] Run `claude --plugin-dir ./plugins/agent-readiness` and `/agent-readiness:audit` with a
      signed-in session to confirm variable substitution (2026-10-12, headless)
- [x] Install from the GitHub marketplace into an empty `CLAUDE_CONFIG_DIR` (2026-10-12)
- [x] The release commit is on `main`: `claude plugin marketplace add alipajand/agent-readiness-action` works
- ☐ Merge the integrations release branch and tag `integrations-v0.1.1`
- ☐ Optional: submit to Anthropic's directory at <https://claude.ai/directory/manage> (requires a
  paid claude.ai plan; the portal applies extra rules the CLI does not check)
