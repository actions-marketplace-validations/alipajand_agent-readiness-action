# Report format

`node scripts/agent-readiness.mjs audit <path> --format json` prints one JSON object
(`schemaVersion: 1`).

```jsonc
{
  "schemaVersion": 1,
  "tool": { "name": "agent-readiness", "version": "0.1.0" },
  "target": "/absolute/path/after/resolving/symlinks",
  "engines": {
    "readiness": {
      "name": "agent-readiness-kit",
      "version": "1.0.0",
      "commit": "<40-hex>",
      "repository": "…",
    },
    "context": {
      "name": "agent-context-doctor",
      "version": "1.0.0",
      "commit": "<40-hex>",
      "repository": "…",
    },
  },
  "readiness": { "status": "ok", "result": {/* readiness report */} },
  "context": {
    "status": "ok",
    "result": { "configApplied": false, "redactions": 0, "report": {/* context report */} },
  },
}
```

Each engine section is one of:

- `{ "status": "ok", "result": … }`
- `{ "status": "error", "error": { "code": "…", "message": "…" } }`: no score exists for this engine
- `{ "status": "skipped" }`: excluded with `--only`

If the path itself is invalid, the output is only `{ "error": { "code", "message" } }` and the exit
code is `1`.

## Readiness report (`readiness.result`)

The exact output of `ark audit --json` from agent-readiness-kit.

| Field                     | Meaning                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `score`                   | 0 to 100                                                         |
| `ecosystems`              | Detected from manifests: `node`, `python`, `go`, `rust`          |
| `categories[]`            | `id`, `label`, `score`, `maxScore`, `findings[]`                 |
| `categories[].findings[]` | `status` (`pass`, `warn`, `fail`), `message`, optional `files[]` |
| `missing[]`               | Short names of missing items                                     |
| `recommendations[]`       | The engine's suggested next steps                                |

## Context report (`context.result.report`)

The output of `acd audit --json` from agent-context-doctor, with one change: credentials quoted in
any issue's `evidence` or `message` are redacted (the engine itself redacts them only in secret
findings). `redactions` counts the fields changed; `0` means the report is exactly the engine's.
`configApplied` is `true` when rules from the audited repository's `.acdrc` were used.

| Field      | Meaning                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `score`    | `total` (0 to 100), `max`, `grade` (`excellent`, `good`, `needs-work`, `risky`)                                                                 |
| `summary`  | `fileCount`, `issueCount`, `high`, `medium`, `low`                                                                                              |
| `files[]`  | `path`, `kind`, `bytes`, optional `skipped` (`outside-repo`, `not-a-file`, `too-large`)                                                         |
| `issues[]` | `id`, `severity` (`high`, `medium`, `low`), `category`, `file`, `line`, `message`, `recommendation`, optional `evidence` (credentials redacted) |

## Error codes

| Code              | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `INVALID_PATH`    | Empty, too long, or contains control characters                        |
| `PATH_NOT_FOUND`  | The directory does not exist (or is a dangling symlink)                |
| `NOT_A_DIRECTORY` | The path is a file                                                     |
| `OUTSIDE_ROOT`    | Outside the authorized roots (MCP server)                              |
| `CONFIG_INVALID`  | The repository's `.acdrc` is not valid; the context engine did not run |
| `ENGINE_FAILED`   | An engine threw an error                                               |
| `TIMEOUT`         | The audit ran past `--timeout`                                         |
