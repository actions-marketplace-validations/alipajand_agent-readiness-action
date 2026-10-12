# Guild.ai Agent Hub: feasibility

**Decision: defer.** No Guild agent is included. With the platform capabilities documented on
2026-10-12, a Guild agent cannot obtain fresh results from the pinned engines on demand. The only
working path depends on workflow runs that already exist, reads results scraped from job logs, and
cannot be tested without a Guild account. Shipping an agent under those conditions would risk
presenting unverified or stale output as the deterministic scanner's result, which this project
rules out.

## Verified SDK limitations

Sources: <https://docs.guild.ai/guide/sdk-introduction.md>, <https://docs.guild.ai/guide/coded-agents.md>,
<https://docs.guild.ai/reference/limits.md>.

- Coded agents are TypeScript modules that may import only `@guildai/agents-sdk` and `zod` (plus
  `@guildai-services/*` tool sets). Importing Node built-ins such as `node:fs` fails at load time.
- `fetch` exists but cannot connect. Agents have no direct route to the internet; all outbound
  traffic goes through Guild integrations.
- The compiled-agent rules forbid `Promise.all`/`race`, require serializable state across `await`,
  and cap state at 8 MiB per save.

Both engines walk a local filesystem with `node:fs` and `fast-glob`. They cannot run in this
sandbox, and porting them onto the GitHub contents API would be a reimplementation of the engines,
which this project does not do.

## Integrations examined

### 1. Guild's first-party GitHub integration

Source: <https://docs.guild.ai/integrations/github.md>. Auth is a GitHub App, limited to the
repositories where it is installed; tools can be narrowed per agent with `pick()`.

| Needed for a real result                                                         | Available?                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Read files (`repos_get_content`)                                                 | Yes, but reading files does not produce engine results         |
| Start a workflow run on a chosen ref (`workflow_dispatch`)                       | **No.** Only `actions_re_run_workflow` re-runs an existing run |
| Download a run artifact (for example a JSON report)                              | **No.** Only `actions_list_workflow_run_artifacts`             |
| Read job logs (`actions_download_job_logs_for_workflow_run`)                     | Yes                                                            |
| Read check runs (`checks_list_for_ref`, `checks_get`, `checks_list_annotations`) | Yes, but the action does not create check runs                 |

### 2. Running the existing GitHub Action and returning its results

The action already runs the pinned engines. The question is whether a Guild agent can get its
output:

- **Starting it:** not possible with the first-party tools (no dispatch). Re-running an earlier run
  needs `actions: write` and only repeats a ref that already has a run.
- **Reading its output:** with `json: 'true'` the action logs the readiness result as JSON between
  `::stop-commands::` markers, but the context audit only as formatted text. The log is the only
  readable channel, every line carries a timestamp prefix, and outputs and job summaries are not
  exposed by the tools.
- **Trusting it:** for `pull_request` runs, the workflow file comes from the pull request, so anyone
  who can open a pull request can make a run print fabricated "results". Only `push` runs on a
  protected default branch are trustworthy, which rules out arbitrary refs.

### 3. A custom Guild integration

Source: <https://docs.guild.ai/services/create-an-integration.md>. Custom integrations proxy REST
operations (defined one by one or from OpenAPI) with API-key or OAuth credentials.

- It could expose `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches` and the artifact
  download endpoint, using a fine-grained token stored in Guild.
- Artifact downloads answer with a redirect to a zip archive. The sandbox cannot add a zip library,
  so the agent could not read the report inside it.
- It means storing a GitHub token with `actions: write` in Guild, on top of the GitHub App: wider
  access than an audit should need.
- Testing it needs a Guild account, and testing against a local service would need a public tunnel.

## Exact technical blocker

The sandbox cannot execute the engines, and no documented Guild capability can both **start** an
audit of an arbitrary ref and **read a structured result** from it without new hosted
infrastructure or broad credentials. Verifying any agent also requires `guild agent test`, which
builds on Guild's servers with an authenticated account; none was created for this work.

## Minimum viable implementation

If the owner wants to proceed, the smallest honest version is a **results reader** for runs that
already happened on the default branch:

1. **Action (needs owner approval, since it changes the action's log output):** with `json: 'true'`,
   also print the context report and wrap the combined JSON in a fixed, single-line delimited block,
   for example `agent-readiness-report:v1:<base64 of the combined JSON>`, so it can be parsed without
   relying on log formatting.
2. **Repository setup:** a workflow on `push` to the default branch that runs the action with
   `json: 'true'` and `context-audit: 'true'`.
3. **Guild agent** (input: `owner`, `repo`, optional `ref`, default the default branch):
   - Tools picked: `repos_get`, `actions_list_workflow_runs`, `actions_list_jobs_for_workflow_run`,
     `actions_download_job_logs_for_workflow_run`. No write tools.
   - Find the newest successful `push` run on the default branch whose `head_sha` equals the
     requested ref. If there is none, return `NO_VERIFIED_RESULT` with no scores.
   - Decode exactly one delimited block; return both scores separately, ranked findings, the engine
     commits, and the run URL as evidence. Any advice the agent adds is labeled as a recommendation,
     separate from the verified results.
4. **Permissions:** GitHub App installed only on the chosen repositories, with Actions read and
   Metadata read; no contents write, no pull requests.
5. **Tests:** unit tests for the decoder in this repository; `guild agent test --mode json` for the
   agent with a fixture repository.

Infrastructure and credentials required: a Guild account and workspace, installing the Guild GitHub
App on the target repositories, and owner approval for the action change. Cost: Guild publishes no
plan prices; the agent itself needs no LLM calls, so its token use would be near zero.

Limitations that remain even then: results exist only for default-branch commits that already ran
the workflow, private repositories need the App installed, forks are unsupported, and marking an
Agent Hub listing public cannot be undone.

## Recommendation

Defer. Revisit when Guild's GitHub integration adds `workflow_dispatch` and artifact download (or a
documented way to read job outputs), or when a hosted execution option exists that can run a pinned
Node.js tool against a checkout. Until then, the MCP server and the plugins cover agent use, and the
GitHub Action covers CI.
