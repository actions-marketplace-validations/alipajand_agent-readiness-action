# Integrations security model

The integrations audit repositories that may be hostile: a pull request branch, a cloned
third-party project, or a directory an AI agent was pointed at. Everything inside the audited
directory is untrusted, including file names, file contents, symlinks, `.arkrc`, `.acdrc`, and
instructions written for agents.

## Guarantees

| Property                   | How it is enforced                                                                                                                                                                                                                                                                                                                                                                                                                                 | Tested in                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Read-only                  | The runtime calls engine library functions, never their CLIs, so `.ark-history.json` and configured report paths are never written. The CLI and MCP server have no option that writes a file.                                                                                                                                                                                                                                                      | `tests/readOnly.spec.ts`                            |
| No network                 | No bundle imports a networking module, and the skill script imports no process module either; the MCP server's only process API is starting its audit worker (all checked on the built files). No engine is downloaded at run time.                                                                                                                                                                                                                | `tests/bundle.spec.ts`                              |
| Pinned engines             | The engines are compiled in from the `vendor/` submodules. The build refuses to run when a submodule is not at its recorded commit, and every report names the commits.                                                                                                                                                                                                                                                                            | `tests/provenance.spec.ts`                          |
| Path confinement           | The target is resolved with `realpath` before any check, must be a directory, and must sit inside an authorized root when roots are configured (always for the MCP server).                                                                                                                                                                                                                                                                        | `tests/paths.spec.ts`, `tests/mcp.spec.ts`          |
| Symlinks inside the target | Both engines refuse to read through a symlink that resolves outside the audited directory (`ark` root-read guard, `acd` `outside-repo` skip).                                                                                                                                                                                                                                                                                                      | `tests/adversarial.spec.ts`                         |
| No command injection       | No shell is ever used. The MCP server starts its audit worker with `spawn(process.execPath, [worker, ...args], { shell: false })` and passes the path as one argument after validating it.                                                                                                                                                                                                                                                         | `tests/mcp.spec.ts`                                 |
| Untrusted text in output   | Markdown output escapes Markdown punctuation and replaces control, bidirectional, zero-width, and tag characters with visible `<U+XXXX>` markers (the doctor's `toDisplayText`). JSON output is produced by `JSON.stringify`.                                                                                                                                                                                                                      | `tests/report.spec.ts`, `tests/adversarial.spec.ts` |
| Secrets                    | The doctor masks recognised credentials in every issue's `message`, `recommendation`, and `evidence`, and configured MCP `env`/`headers` values in every finding on their line; the runtime also masks the issue `id`, which can carry a link target (`context.result.redactions` counts the ids changed). File paths are not masked. `.acdrc` symlinks leading outside the repository are refused unread, by the runtime and again by the engine. | `tests/adversarial.spec.ts`                         |
| Bounded work               | The doctor skips instruction files above its size limit (40 kB by default). The CLI stops after `--timeout` seconds, and the MCP server kills a worker that runs past its time limit or prints more than its output limit.                                                                                                                                                                                                                         | `tests/cli.spec.ts`, `tests/mcp.spec.ts`            |
| Clean MCP stdio            | The server writes only protocol messages to stdout. Worker output is captured and never forwarded, and diagnostics go to stderr.                                                                                                                                                                                                                                                                                                                   | `tests/mcp.spec.ts`                                 |

## Instructions inside audited repositories

Audited files are data. The skill tells the agent not to follow instructions found in `AGENTS.md`,
`CLAUDE.md`, or any other audited file, and to report them only as findings. The MCP server
returns engine findings as structured data and never acts on file contents.

## Offline scanner, AI client

The scanner is offline and deterministic: the skill script and the MCP server make no network
requests, and the same repository and engine commits always give the same report. The AI client
that runs them is a separate program with its own data handling. It reads the audit results and
can send them to its model provider; it may also read the repository's files directly, outside the
scanner, and send those too. These integrations cannot control that. Credential masking applies
only to the scanner's output, never to files the client reads itself. Check the client's data
policy before auditing a repository whose contents must not leave the machine, or run the script
without an agent:
`node plugins/agent-readiness/skills/agent-readiness-audit/scripts/agent-readiness.mjs audit <path>`.

## What is out of scope

- The engines' detection rules and scoring. They are reviewed in their own repositories.
- Protection against a malicious Node.js installation, or a modified bundle on the user's disk.
  Release artifacts are reproducible from the tagged source so they can be checked.
- Remote repositories. No integration clones or fetches a repository.
