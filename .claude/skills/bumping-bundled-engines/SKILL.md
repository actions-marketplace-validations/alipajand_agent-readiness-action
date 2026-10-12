---
name: bumping-bundled-engines
description: Move the vendored agent-readiness-kit or agent-context-doctor submodule to a newer commit and rebuild dist/. Use when asked to pick up a new version of either engine or to fix a failing Dependabot submodule PR.
---

# Bumping a bundled engine

1. `git submodule update --init` so both `vendor/` submodules are present.
2. In `vendor/agent-readiness-kit` or `vendor/agent-context-doctor`, fetch and check out the
   commit you want (normally the latest `main`). Read its CHANGELOG for breaking changes.
3. `pnpm install`. If the engine gained a dependency the action imports (directly or through the
   modules `src/runArk.ts` and `src/runDoctor.ts` use), add it to `package.json`.
4. Run `/verify`. Fix type errors in `src/runArk.ts` or `src/runDoctor.ts` if the engine's API
   changed; never edit files under `vendor/`.
5. Stage the submodule pointer, then run `pnpm integrations:build` and `pnpm integrations:test`.
   The build refuses to run until the submodule commit is staged, and it regenerates the skill
   script, the MCP server bundle, and `integrations/src/runtime/provenance.generated.ts`.
6. Commit the submodule pointer, the rebuilt `dist/`, and the rebuilt integration bundles together.
   CI fails when any of them is stale.
7. Note the engine change in `CHANGELOG.md`, and release a new integrations version
   (`docs/RELEASE-CHECKLIST.md`) so plugin and MCP users receive it.
