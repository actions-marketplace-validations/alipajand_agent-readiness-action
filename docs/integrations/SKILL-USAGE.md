# Using the agent-readiness-audit skill

The skill lives at `plugins/agent-readiness/skills/agent-readiness-audit/`. It is a standard
[Agent Skill](https://agentskills.io/specification): a `SKILL.md`, a reference page, and one
self-contained script, `scripts/agent-readiness.mjs`, that contains both audit engines.

**Prerequisite:** Node.js 22.12 or later on the `PATH`. Nothing else is installed, and the audit
works offline.

## Install

| Client                  | How                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code             | Install the plugin (see [PLUGINS.md](PLUGINS.md)), or copy the skill directory to `~/.claude/skills/agent-readiness-audit/` (all projects) or `.claude/skills/agent-readiness-audit/` (one project).                                                                                 |
| Cursor                  | Install the plugin (see [PLUGINS.md](PLUGINS.md)), or copy the skill directory to `~/.cursor/skills/` or `.cursor/skills/`. Cursor also reads `.agents/skills/` and `.claude/skills/`.                                                                                               |
| Codex and other clients | `npx skills add alipajand/agent-readiness-action --skill agent-readiness-audit` places the skill where the chosen client looks for it (`-a <agent>` picks the client, `-g` installs globally). Set `DISABLE_TELEMETRY=1` to turn off the `skills` CLI's anonymous install telemetry. |
| Any client, by hand     | Copy the whole `agent-readiness-audit` directory into the client's skills directory. Copy it; do not symlink it, because some clients skip symlinks.                                                                                                                                 |

Installing with `npx skills` downloads the `skills` CLI from npm; the skill itself has no
dependencies.

## Use

Ask the agent for what you want, for example "audit this repository's agent readiness" or "check
our AGENTS.md and Cursor rules for problems". In Claude Code you can also invoke it directly with
`/agent-readiness-audit` (or `/agent-readiness:agent-readiness-audit` from the plugin).

The script can also be run without an agent:

```bash
node plugins/agent-readiness/skills/agent-readiness-audit/scripts/agent-readiness.mjs audit /path/to/repo
```

| Option                                           | Effect                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| `--format markdown` (default) or `--format json` | Output format. JSON is the complete report.      |
| `--only readiness` / `--only context`            | Run one engine                                   |
| `--max-items <n>`                                | Items per Markdown section (default 25)          |
| `--timeout <seconds>`                            | Stop after this many seconds (default 300)       |
| `version`                                        | Print the runtime version and the engine commits |

Exit codes: `0` both engines finished, `1` an engine or the path failed, `2` usage error.
The JSON fields are described in
[references/REPORT-FORMAT.md](../../plugins/agent-readiness/skills/agent-readiness-audit/references/REPORT-FORMAT.md).

## Results match the engines

For the same engine commits and a repository without the cases listed below, the
`readiness.result` section equals the output of
`ark audit --json --no-history`, and `context.result.report` equals `acd audit --json`.
`integrations/tests/parity.spec.ts` checks this on Node.js, Python, Go, Rust, mixed, and empty
repositories.

Differences from running the engine CLIs yourself:

- `.arkrc` is ignored. It only sets CLI options (`repoPath`, `output`, `json`, `minScore`), none of
  which change the score, but an invalid `.arkrc` makes `ark audit` exit with an error where the
  skill still reports a score.
- Credentials quoted in a context issue's `evidence` or `message` are redacted; the doctor redacts
  them only in its secret findings. `context.result.redactions` counts these changes, and when it
  is `0` the report is exactly the engine's.
- An `.acdrc` that is a symlink to a file outside the repository is refused with `CONFIG_INVALID`
  instead of being read.
- `.acdrc` rules (`ignoreFiles`, `disabledChecks`, `allowedMissingScripts`, `maxFileBytes`) apply.
  Its `audit` options (`output`, `baseline`, `repoPath`, `format`, `failOn`, `minScore`) are
  ignored, so the audited repository cannot make the audit write a file or audit another path.
- No `.ark-history.json` is written, so there is no score delta.
