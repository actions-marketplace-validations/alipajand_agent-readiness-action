# @alipajand/agent-readiness-mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) server that audits repositories
for AI coding agents with two deterministic engines:

- **agent-readiness-kit**: a 0–100 readiness score across 13 categories (instructions,
  architecture, workflow, testing, safety, and more) for Node.js, Python, Go, and Rust projects.
- **agent-context-doctor**: quality and safety issues in `AGENTS.md`, `CLAUDE.md`, Cursor and
  Copilot rules, and agent MCP/settings files. Credentials quoted in any finding are redacted.

The audit is read-only and offline. It uses no LLM and no API key, sends no telemetry, and never
runs the audited repository's scripts. Both engines are compiled into the package from pinned
commits, so it has no runtime dependencies.

## Tools

| Tool                  | Returns                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `audit_repository`    | Readiness score, categories, checks that did not pass (fail before warn), recommendations |
| `audit_agent_context` | Context score and grade, files checked, issues ordered high → low                         |
| `get_audit_report`    | Further pages of a report from this session, optionally with the engine's complete JSON   |

`audit_repository` and `audit_agent_context` take an optional `path` (default: the first root). All
three tools are annotated read-only.

## Install

Requires Node.js 22.13 or later (23.5 or later on Node.js 23). Older releases have no stable
permission model for the audit sandbox described below, and the server refuses to start on them.

```bash
npm install -g @alipajand/agent-readiness-mcp@0.1.0
```

## Configure a client

The server only audits directories inside its roots. Give one `--root` per directory the client
may audit; with none, it uses the directory it was started in.

Claude Code:

```bash
claude mcp add agent-readiness -- agent-readiness-mcp --root /path/to/projects
```

Cursor (`.cursor/mcp.json`) and other clients that use the `mcpServers` format:

```json
{
  "mcpServers": {
    "agent-readiness": {
      "command": "agent-readiness-mcp",
      "args": ["--root", "/path/to/projects"]
    }
  }
}
```

Without a global install, use `"command": "npx"` with
`"args": ["-y", "@alipajand/agent-readiness-mcp@0.1.0", "--root", "/path/to/projects"]`. Keep the
version pinned.

Options: `--root <dir>` (repeatable), `--timeout <seconds>` (default 120), `--max-concurrency <n>`
(default 2).

## Security

- Paths are resolved through symlinks and must stay inside a root.
- Each audit runs in a separate Node.js process started without a shell, with an empty environment,
  a time limit, and an output limit. That process runs under Node's permission model: it can read
  only the audited directory and its own script, and cannot write files or start processes. Node
  lets a granted read follow a symlink, so the engines' own symlink checks still contain reads; the
  sandbox is a second layer.
- Stdout carries only MCP messages; diagnostics go to stderr.
- Reports are kept in memory for the session (the 20 most recent) and never written to disk.
- Text in results comes from the audited repository and should be treated as data.

## License

MIT. Bundled third-party licenses are in `dist/THIRD-PARTY-LICENSES.txt` and
`dist/audit-worker.THIRD-PARTY-LICENSES.txt`.
