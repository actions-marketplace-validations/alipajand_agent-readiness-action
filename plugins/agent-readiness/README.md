# Agent Readiness

Agent Readiness scores how ready a source repository is for AI coding agents and checks its agent
instruction and configuration files (AGENTS.md, CLAUDE.md, Cursor rules, Copilot instructions, MCP
and agent settings) for quality and safety problems. It audits a repository on your machine; it
does not scan websites.

The scores come from two rule-based engines compiled into this plugin from pinned commits:

- [agent-readiness-kit](https://github.com/alipajand/agent-readiness-kit) at `f15924b`: readiness
  score from 0 to 100 across 13 categories, for Node.js, Python, Go, and Rust projects.
- [agent-context-doctor](https://github.com/alipajand/agent-context-doctor) at `034a74c`: findings
  for vague or placeholder guidance, contradictions, stale commands, risky permissions, hidden
  Unicode, and committed secrets.

Every report names both engine commits. No language model computes or adjusts a score.

## Requirements

Node.js 22.12 or later on the `PATH`. Nothing else is installed, and no API key is needed.

## Install

Claude Code:

```bash
claude plugin marketplace add alipajand/agent-readiness-action
```

```bash
claude plugin install agent-readiness@agent-readiness
```

Cursor: copy this folder to `~/.cursor/plugins/local/agent-readiness` (copy it, do not symlink it),
then run **Developer: Reload Window**. The Cursor Marketplace listing is not available yet.

## Use

- Claude Code: `/agent-readiness:audit [path]` runs the audit on a path (default: the current
  directory). `/agent-readiness:agent-readiness-audit` invokes the skill by name.
- Cursor: run the `agent-readiness-audit` command.

Invoking the audit by name is the tested path. Asking in plain words relies on the client choosing
to load the skill, which is not verified as reliable. An answer without the engines' scores and
commits means the audit did not run.

## Components

- `commands/audit.md`: the Claude Code command. It pre-approves exactly one command: running the
  bundled script with Node.js.
- `cursor-commands/agent-readiness-audit.md`: the Cursor command, which uses the skill.
- `skills/agent-readiness-audit/`: the skill, its report format reference, and
  `scripts/agent-readiness.mjs`, a single self-contained script that contains both engines. The
  script is generated from the engines' source at the commits above and is committed so the plugin
  needs no install step; the source is in this repository's `vendor/` submodules and
  `integrations/` folder.

The plugin has no hooks, no MCP servers, and nothing that runs at install or startup.

## What runs and what leaves your machine

- **The scanner** (the bundled script) reads files in the directory you choose. It writes nothing,
  runs none of the repository's scripts, makes no network requests, and keeps nothing after it
  exits.
- **The AI client** (Claude Code or Cursor) is separate. It reads the audit results and can send
  them, and any repository files it reads itself, to its model provider under its own data policy.
  This plugin cannot change that.
- **Credential masking** is pattern-based and applies only to the scanner's output. Credentials in
  an unrecognised format, file paths, and files the client reads directly are not masked.

If the script cannot run, the command and the skill tell the model to say the audit did not run,
give no scores, and not inspect the files instead.

## Tested clients

Claude Code 2.1.278 on macOS, with Linux CI. Not tested: Cursor, Windows, Claude Code's interactive
permission prompts, Codex and other skill clients.

## More

- Repository and full documentation: https://github.com/alipajand/agent-readiness-action
- Security model: `docs/integrations/SECURITY-MODEL.md` in the repository
- License: MIT (see `LICENSE`)
