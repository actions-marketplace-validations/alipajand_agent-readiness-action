# MCP server

`@alipajand/agent-readiness-mcp` is a local stdio MCP server built from
`integrations/src/mcp/` into `integrations/mcp-package/`. User-facing installation and client
configuration are in [the package README](../../integrations/mcp-package/README.md).

## Capabilities

| Tool                  | Input                                                                           | Structured output                                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_repository`    | `path?`, `max_findings` (1–100, default 20)                                     | `report_id`, `target`, `engine` (name, version, commit), `score`, `ecosystems`, `categories`, ranked `findings`, `total_findings`, `recommendations`, `truncated`                                                                                                                       |
| `audit_agent_context` | `path?`, `max_findings`                                                         | `report_id`, `target`, `engine`, `score` (total, max, grade), `summary`, `config_applied`, `files`, ranked `issues` (credentials redacted in `evidence` and `message`), `total_issues`, `truncated`                                                                                     |
| `get_audit_report`    | `report_id` (UUID), `offset`, `limit` (1–100), `include_passing`, `include_raw` | A page of `readiness_items` (continuing the summary's ranked order; passing checks after them with `include_passing`) or `context_items`, `total`, `next_offset`; with `include_raw`, the engine's complete JSON (credentials redacted, strings otherwise as found; refused above 1 MB) |

All three tools declare `inputSchema` and `outputSchema` and return both `structuredContent` and the
same JSON as text, as the 2026-07-28 specification asks. They are annotated `readOnlyHint: true`,
`destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. No resources or prompts are
exposed: paging through `get_audit_report` covers retrieval without a second mechanism.

Errors are tool results with `isError: true` and `{ "error": { "code", "message" } }`. Codes:
`INVALID_PATH`, `PATH_NOT_FOUND`, `NOT_A_DIRECTORY`, `OUTSIDE_ROOT`, `CONFIG_INVALID`,
`ENGINE_FAILED`, `TIMEOUT`, `OUTPUT_TOO_LARGE`, `BUSY`, `REPORT_NOT_FOUND`. Inputs that fail the
schema are rejected by the SDK before the handler runs.

## Design

```text
MCP client ──stdio──▶ server.js (SDK 2.2.0, McpServer + StdioServerTransport)
                         │ resolveTarget: realpath, directory, inside --root
                         │ Limiter: 2 at once, 8 queued, then BUSY
                         ▼
                  spawn(node, [--permission, --allow-fs-read=<target>, audit-worker.mjs,
                               audit, <target>, --format, json, --only, <engine>])
                         │ shell: false, env: {} (+ SystemRoot/TEMP/TMP on Windows),
                         │ killed after --timeout or 32 MB of output
                         ▼
                  audit-worker.mjs (byte-identical to the skill's agent-readiness.mjs)
```

- The worker is the skill's bundle, so the MCP server, the skill, and both plugins run identical
  engine code (`tests/bundle.spec.ts` checks the files are equal).
- The worker runs under Node's permission model with read access to the audited directory and its
  own script only. The model is stable from Node.js 22.13 and 23.5; the server refuses to start on
  older releases rather than run workers unconfined (`tests/mcp.spec.ts`). `tests/parity.spec.ts` checks the sandbox does not
  change any result, including for a subdirectory of a larger repository.
- Node 24.11 denies every read when one granted path is nested inside another (for example, the
  worker script inside the audited tree). `readGrants` drops covered paths, and
  `tests/worker.spec.ts` covers that case.
- Reports stay in memory (20 most recent) for `get_audit_report`; nothing is written to disk.
- Strings from the audited repository are clipped to 2,000 characters in summaries, and every tool
  description tells the client to treat them as data.

## Test results

`pnpm integrations:test`: 16 files, 112 tests passing (2026-10-12). The MCP-specific tests are:

| Area               | Test                                                                                                                                                             | Result                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Discovery          | Three tools, object input/output schemas, read-only annotations                                                                                                  | Pass                            |
| Output equivalence | `audit_repository` score and categories equal `ark audit --json`; `include_raw` equals it exactly; same for `audit_agent_context` and `acd audit --json`         | Pass                            |
| Pagination         | Pages of 7 cover every readiness check                                                                                                                           | Pass                            |
| Malicious paths    | Outside the root, `../..`, traversal through a subdirectory, symlink out of the root, newline and shell metacharacters                                           | `OUTSIDE_ROOT` / `INVALID_PATH` |
| Hostile repository | Injected instructions returned as findings; AWS key redacted; symlinked file outside the repository skipped (`outside-repo`), its content never returned         | Pass                            |
| Invalid config     | Malformed `.acdrc`                                                                                                                                               | `CONFIG_INVALID`                |
| Schema validation  | `max_findings: 0`, non-UUID `report_id`, unknown report                                                                                                          | Rejected / `REPORT_NOT_FOUND`   |
| Concurrency        | Six parallel calls: identical scores, distinct report ids; 14 calls with concurrency 1: excess rejected with `BUSY`                                              | Pass                            |
| Timeout and size   | Hanging worker killed at the limit (`TIMEOUT`); flooding worker killed (`OUTPUT_TOO_LARGE`); worker printing no JSON (`ENGINE_FAILED`)                           | Pass                            |
| Isolation          | Worker receives no environment secrets and the exact argument vector; file writes fail with `ERR_ACCESS_DENIED`                                                  | Pass                            |
| Protocol stream    | Raw stdio session: every stdout line is JSON-RPC; startup banner goes to stderr                                                                                  | Pass                            |
| Startup            | Missing root, `--timeout 0`, unknown flag: exit 2 with usage                                                                                                     | Pass                            |
| Packaging          | `npm pack` contains exactly the eight expected files; `npm install --offline` into an empty project; server starts from the npm bin link and answers a tool call | Pass                            |
| Registry metadata  | `server.json` validates against the registry's schema snapshot; name equals `mcpName`; description ≤ 100 characters                                              | Pass                            |

## Client compatibility

| Client                                    | How verified                                                                                                           | Status                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official TypeScript client SDK 2.2.0      | Automated tests above                                                                                                  | Verified                                                                                                                                                                                                                                                                                                                       |
| MCP Inspector CLI 2.10.1                  | `--method tools/list` and `tools/call audit_repository` against `dist/server.js`                                       | Verified (this found and fixed the nested-grant issue)                                                                                                                                                                                                                                                                         |
| Older (handshake-era) clients             | Raw `initialize` with protocol `2025-11-25` in the stream test                                                         | Verified                                                                                                                                                                                                                                                                                                                       |
| Claude Code 2.1.278 (signed in, headless) | Packed tarball installed offline; server given with `--mcp-config` and `--root`; all three tools called from a session | Verified 2026-10-12: server connected with no startup or sandbox error; scores equal to the engines (readiness 31, context 0 risky); `get_audit_report` paged 5 + 10 + 10 + 2 = 27 items; `OUTSIDE_ROOT` for a path outside the root; `CONFIG_INVALID` for an `.acdrc` linked outside; no planted credential in the transcript |
| Cursor, other hosts                       | Configuration documented in the package README                                                                         | Not tested: Cursor is not installed on the build machine                                                                                                                                                                                                                                                                       |

## Packaging and registry status

| Item                                      | Status                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm name `@alipajand/agent-readiness-mcp` | Not taken on npm; the `@alipajand` scope belongs to the owner's npm account                                                                                                                    |
| Dependencies                              | None at run time; `@modelcontextprotocol/server` 2.2.0 and `zod` 4.6.5 are compiled in (2.2.0 chosen as the newest release at least two weeks old; 2.3.x only changes HTTP auth and redirects) |
| `server.json`                             | Valid: `mcp-publisher validate` (1.8.1, checksum verified) reported `✅ server.json is valid` against `registry.modelcontextprotocol.io`                                                       |
| Publication                               | Not done. Requires `npm publish` by the owner, then `mcp-publisher login github` and `mcp-publisher publish`                                                                                   |

## Dependency audit

`pnpm audit` after this work reports one advisory, present before it:

- `nanoid` 3.3.17 (high) inside vite/vitest, used only by tests.

The `braces` 3.0.3 advisory reported at review time (through `fast-glob`) is gone: both engines
now use `tinyglobby`, and the submodules were moved to those commits.

`ajv` (moderate, `$data` ReDoS) was raised to 8.18.0; it is a test-only dependency.
