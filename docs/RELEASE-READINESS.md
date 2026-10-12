# Release readiness

Status on 2026-10-12. Nothing has been pushed, published, or submitted.

## Implemented and tested

- Shared runtime and `agent-readiness` CLI (`integrations/src/`).
- Agent Skill `agent-readiness-audit`: `skills-ref` valid; installs with the `skills` CLI; clean
  install runs under Node's permission model with writes denied.
- Claude Code plugin and marketplace: validated with `claude plugin validate`; installed from a git
  marketplace into an empty configuration; cached bundle identical and working.
- MCP server `@alipajand/agent-readiness-mcp` 0.1.0: three tools, sandboxed workers, tested with the
  official client SDK and the MCP Inspector CLI; packed tarball installs offline and runs.
- `server.json`: valid per `mcp-publisher validate` and the schema snapshot.
- CI job for the integrations (runs once pushed).
- GitHub Action: unchanged and passing.

## Implemented but unverified

- Claude Code live-session substitution of `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}`.
- Cursor plugin loading.
- MCP server inside a live host (Claude Code, Cursor).
- Linux and Windows runs (Linux is covered by CI after push; Windows is not covered).
- Codex and other skill clients.

## Blocked by external requirements

| Item                       | Blocker                                                                   | Owner action                                                                 |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Official MCP Registry      | Requires the npm package to be published first                            | `npm publish`, then `mcp-publisher login github` and `mcp-publisher publish` |
| Guild.ai Agent Hub         | Sandbox cannot run the engines; no workflow dispatch or artifact download | None now; revisit per `docs/integrations/GUILD-FEASIBILITY.md`               |
| agent-hub.dev              | No submission mechanism                                                   | Recheck later                                                                |
| Anthropic plugin directory | Paid claude.ai plan                                                       | Submit at <https://claude.ai/directory/manage> after the live check          |
| Glama, mcpserver.dev       | Need the published package and pushed repository                          | Submit after npm publish                                                     |

## Not implemented

- Smithery listing (needs an MCPB bundle).
- Guild agent (deliberately not built).
- HubSpot integration (no use case).

## Remaining blockers

| Blocker                 | Exact failing check   | Reason                                                           | Owner action                        |
| ----------------------- | --------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| CI not yet run on Linux | None failing; not run | Nothing pushed                                                   | Push the branch                     |
| Manual client checks    | Not run               | No authenticated Claude Code session; Cursor not installed       | Steps in `RELEASE-CHECKLIST.md` § 3 |
| Open finding A          | None failing          | Pre-existing action behavior; needs an action or upstream change | Decide per `SECURITY-FINDINGS.md`   |

No test fails. Production readiness for the integrations depends on the three rows above; no
critical findings remain open.
