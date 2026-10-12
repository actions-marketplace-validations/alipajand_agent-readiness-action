# Platform matrix

Requirements were checked against the official documentation on 2026-10-12. Re-check the linked
pages before each release: several of these platforms change often.

## Summary

| Platform                  | Format we ship                                                                                | Adapter                     | Local verification                                                      | Blockers                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GitHub Actions            | `action.yml` + `dist/index.js` (existing)                                                     | `src/`                      | CI self-test                                                            | None                                                                   |
| Agent Skills (any client) | `skills/agent-readiness-audit/` with `SKILL.md` and a bundled script                          | `integrations/src/cli.ts`   | `skills-ref validate`, `tests/skill.spec.ts`, `tests/install.spec.ts`   | None                                                                   |
| Claude Code plugin        | `plugins/agent-readiness/.claude-plugin/plugin.json` + root `.claude-plugin/marketplace.json` | Skill plus one command      | `claude plugin validate`, install into a temporary config directory     | Directory listing needs a paid claude.ai plan                          |
| Cursor plugin             | `plugins/agent-readiness/.cursor-plugin/plugin.json` + root `.cursor-plugin/marketplace.json` | Same skill plus one command | Manifest tests; manual load from `~/.cursor/plugins/local/`             | No Cursor CLI to install headlessly; manual review before listing      |
| MCP (local stdio)         | npm package `@alipajand/agent-readiness-mcp`                                                  | `integrations/src/mcp/`     | SDK client tests, MCP Inspector CLI                                     | npm publish is owner-only                                              |
| Official MCP Registry     | `server.json`                                                                                 | Package above               | Local JSON Schema check; `mcp-publisher validate` contacts the registry | Requires the npm package to be published first; registry is in preview |
| Guild.ai Agent Hub        | See [GUILD-FEASIBILITY.md](GUILD-FEASIBILITY.md)                                              | —                           | Requires a Guild account                                                | Sandbox cannot run the engines (see feasibility document)              |
| skills.sh                 | The same skill, discovered from the GitHub repository                                         | —                           | `npx skills add <path> --list`                                          | None: listing is automatic once people install it                      |

## Agent Skills

- **Docs:** <https://agentskills.io/specification>, validator
  <https://github.com/agentskills/agentskills/tree/main/skills-ref>.
- **Format:** a directory named after the skill containing `SKILL.md` (YAML frontmatter, Markdown
  body) and optional `scripts/`, `references/`, `assets/`. Required fields: `name` (1–64 characters,
  lowercase letters, digits, single hyphens, equal to the directory name) and `description`
  (1–1024 characters). Optional: `license`, `compatibility` (≤ 500 characters), `metadata` (string
  map), `allowed-tools` (experimental). Keep the body under 500 lines.
- **Adapter:** the skill runs `scripts/agent-readiness.mjs`, the committed bundle of
  `integrations/src/cli.ts` with both engines compiled in. It only needs Node.js 22.12+.
- **Portability:** only the six standard fields are used. claude.ai uploads and the Skills API
  reject other keys. Claude Code substitutes `${CLAUDE_SKILL_DIR}` in the body and in
  `allowed-tools`; other clients see the literal text, so the body also explains the path in words.
- **Verification:** `skills-ref validate plugins/agent-readiness/skills/agent-readiness-audit`
  (Python, installed from source; its README says it is for demonstration). The same rules are
  enforced in CI by `integrations/tests/skill.spec.ts`.
- **Publishing:** none needed. Clients install from the GitHub repository.

## Claude Code plugin

- **Docs:** <https://code.claude.com/docs/en/plugins>,
  <https://code.claude.com/docs/en/plugins/manifest-reference>,
  <https://code.claude.com/docs/en/plugins/create-marketplace>,
  <https://code.claude.com/docs/en/plugins/marketplace-reference>,
  <https://code.claude.com/docs/en/plugins/loading>, <https://code.claude.com/docs/en/plugins/publish>,
  <https://code.claude.com/docs/en/skills>.
- **Format:** optional `.claude-plugin/plugin.json` (only `name` required; names starting with
  `claude-` or `anthropic-` are rejected), components at the plugin root (`skills/`, `commands/`).
  A marketplace is `.claude-plugin/marketplace.json` with `name`, `owner.name`, and `plugins[]`;
  a relative `source` must start with `./`.
- **Install behavior:** marketplace plugins are copied to
  `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Files outside the plugin directory
  are not copied and symlinks leaving it are rejected, so the skill bundle lives inside the plugin.
  `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` are substituted in skill and command text but
  are not exported to Bash.
- **Verification:** `claude plugin validate plugins/agent-readiness` and `claude plugin validate .`
  (marketplace), then `claude plugin marketplace add` and `claude plugin install` with
  `CLAUDE_CONFIG_DIR` pointing at a temporary directory.
- **Publishing:** users add the marketplace with `/plugin marketplace add alipajand/agent-readiness-action`.
  Listing in Anthropic's directory goes through <https://claude.ai/directory/manage> and needs a
  paid claude.ai plan.

## Cursor plugin

- **Docs:** <https://cursor.com/docs/plugins>, <https://cursor.com/docs/reference/plugins>,
  <https://cursor.com/docs/skills>.
- **Format:** `.cursor-plugin/plugin.json` (only `name` required, kebab-case). Default discovery of
  `skills/`, `rules/`, `agents/`, `commands/`, `hooks/hooks.json`, and `mcp.json` (no leading dot).
  A multi-plugin repository adds `.cursor-plugin/marketplace.json` (`name`, `owner.name`,
  `plugins[]` with `name` and `source`).
- **Compatibility:** Cursor implements the Agent Skills standard. No Cursor page says it installs a
  `.claude-plugin` plugin, so the plugin directory carries both manifests. Cursor expands
  `${CLAUDE_PLUGIN_ROOT}` only in MCP configuration, so the Cursor command delegates to the skill
  instead of naming the script path.
- **Verification:** copy (not symlink) the plugin directory to `~/.cursor/plugins/local/agent-readiness`,
  reload the window, and check **Customize**. There is no Cursor CLI on this machine, so this is a
  manual step on the release checklist.
- **Publishing:** submit the public repository at <https://cursor.com/marketplace/publish>. Plugins
  must be open source; every version is reviewed by hand.

## MCP server and registry

- **Docs:** <https://modelcontextprotocol.io/specification/2026-07-28/server/tools>,
  <https://github.com/modelcontextprotocol/typescript-sdk>,
  <https://github.com/modelcontextprotocol/registry/tree/main/docs/modelcontextprotocol-io>.
- **SDK:** `@modelcontextprotocol/server` 2.x (current line, protocol 2026-07-28, zod ^4.2,
  Node 20+). It still negotiates with older clients through the `initialize` handshake.
- **Tools:** with an `outputSchema`, the server must return conforming `structuredContent` and
  should repeat it as JSON text.
- **Registry format:** `server.json` with
  `$schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`, `name`
  `io.github.alipajand/agent-readiness` (GitHub namespace), `description` ≤ 100 characters,
  `packages[]` entry `{ registryType: "npm", identifier, version, transport: { type: "stdio" } }`.
  The npm package's `package.json` must carry `"mcpName": "io.github.alipajand/agent-readiness"`.
- **Verification:** SDK client tests in `integrations/tests/mcp.spec.ts`; MCP Inspector CLI
  (`--method tools/list`); `server.json` checked against the published schema.
  `mcp-publisher validate` posts the file to the registry, so it is an online pre-publish step.
- **Publishing:** `npm publish` of `@alipajand/agent-readiness-mcp` (the `@alipajand` npm scope
  belongs to the owner), then `mcp-publisher login github` and `mcp-publisher publish`. The registry
  is in preview and its data may be reset.

## Guild.ai

- **Docs:** <https://docs.guild.ai/guide/sdk-introduction.md>,
  <https://docs.guild.ai/guide/coded-agents.md>, <https://docs.guild.ai/integrations/github.md>,
  <https://docs.guild.ai/platform/publish-to-agent-hub.md>.
- **Constraint:** coded agents may import only `@guildai/agents-sdk` and `zod`; no Node built-ins,
  no direct network access. The engines read a filesystem, so they cannot run inside the sandbox.
- See [GUILD-FEASIBILITY.md](GUILD-FEASIBILITY.md) for the investigation and decision.

## skills.sh

- **Docs:** <https://skills.sh/docs>, <https://github.com/vercel-labs/skills>.
- **Format:** any `SKILL.md` the `skills` CLI discovers in the repository (it searches `skills/`,
  plugin manifests, and recursively).
- **Publishing:** no submission. A skill appears after people run
  `npx skills add alipajand/agent-readiness-action`; the CLI reports anonymous install telemetry
  unless `DISABLE_TELEMETRY=1` is set.
