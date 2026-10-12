# Release checklist: integrations

The GitHub Action keeps its own release steps (README, "Releasing"). This checklist covers the
skill, the Claude Code and Cursor plugin, and the MCP server. Integration releases use
`integrations-v<version>` tags and never move the action's `v1` tag.

## 0. Release gate

- [x] agent-context-doctor#74 is merged (security findings A, B, E, F), and
      `vendor/agent-context-doctor` points at its merge commit `034a74c` on `main`
- [x] The bump was made with the `bumping-bundled-engines` skill: `dist/`, the skill script, the MCP
      bundles, and `provenance.generated.ts` rebuilt and committed together
- [x] `integrations/tests/adversarial.spec.ts` asserts the configured-credential case (a value under
      `env.API_TOKEN` in a one-line `.mcp.json` never appears in the output); it fails against the
      previous engine
- [ ] CI passes on the final commit of the pull request (Linux, Node.js 22.13.0 and 24)
- [ ] The live-client checks in § 3 pass

## 1. Versions

All of these carry the same version (`integrations/tests/plugins.spec.ts`,
`skill.spec.ts`, and `mcpPackage.spec.ts` fail if they differ):

- [ ] `integrations/src/runtime/version.ts` (`TOOL_VERSION`)
- [ ] `plugins/agent-readiness/.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
- [ ] `plugins/agent-readiness/skills/agent-readiness-audit/SKILL.md` (`metadata.version`)
- [ ] `integrations/mcp-package/package.json` and both `version` fields in `server.json`
- [ ] Pinned version in `integrations/mcp-package/README.md` and `docs/distribution/README.md`

## 2. Build and verify

```bash
git submodule update --init
```

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

```bash
pnpm integrations:typecheck && pnpm integrations:build && pnpm integrations:test
```

- [ ] `git status` shows no changes after the builds (`dist/`, the skill script, `mcp-package/dist`,
      `provenance.generated.ts`)
- [ ] `skills-ref validate plugins/agent-readiness/skills/agent-readiness-audit`
- [ ] `claude plugin validate .` and `claude plugin validate --strict plugins/agent-readiness`
- [ ] `mcp-publisher validate integrations/mcp-package/server.json`
- [ ] `pnpm audit`: no new advisories in shipped code (see `docs/SECURITY-FINDINGS.md` for known ones)
- [ ] CI green on the final commit: `Test · Typecheck · Build`, `Run the action on this repository`,
      both `Integrations` jobs (Node.js 22.13.0 and 24), and CodeQL
- [ ] `npm pack` twice in `integrations/mcp-package` gives byte-identical tarballs

## 3. Manual client checks

- [ ] Claude Code: `claude --plugin-dir ./plugins/agent-readiness`, run `/agent-readiness:audit`
      on a sample repository, and confirm the command runs the bundled script without a permission
      prompt and reports the engine scores
- [ ] Cursor: copy `plugins/agent-readiness` to `~/.cursor/plugins/local/agent-readiness`, reload,
      run the `agent-readiness-audit` command
- [ ] One MCP host (Claude Code or Cursor): add the server with `--root`, call `audit_repository`
      and `audit_agent_context`, and confirm the host shows no sandbox or startup error
- [ ] Windows, if it is to be listed as supported: run the skill script and the MCP server once

## 4. Publish (owner only)

- [ ] Merge to `main`, tag `integrations-v<version>`, push the tag
- [ ] `npm publish` from `integrations/mcp-package` with 2FA. The package does not request npm
      provenance: npm only generates it from a supported CI provider, and no workflow here
      publishes. To publish with provenance, add a workflow with `id-token: write` that runs
      `npm publish --provenance` (or npm trusted publishing) from this repository
- [ ] `mcp-publisher login github` as `alipajand` (the `io.github.alipajand/*` namespace), then
      `mcp-publisher publish` from `integrations/mcp-package`. The registry checks that the
      published npm package's `mcpName` equals `server.json`'s `name`, so publish npm first
- [ ] Release the action separately (README, "Releasing"): this branch changes `dist/` through the
      engine updates, so it needs a new action version, not only an integrations tag
- [ ] Cursor Marketplace: submit or update at <https://cursor.com/marketplace/publish>
- [ ] Update statuses and evidence in `docs/PUBLISHING-MATRIX.md`

## Engine bumps

Moving either submodule changes every bundle. After the `bumping-bundled-engines` skill rebuilds
`dist/`, also run `pnpm integrations:build`, commit the regenerated bundles and
`provenance.generated.ts`, and release a new integrations version so plugin users receive it.
