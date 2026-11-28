---
id: SPEC-0087
status: archived
issue: theholocron/holocron#2238
blocked-by: []
discussion:
  url: https://discord.com/channels/1303969001822486568/1571709166207246468
---

# Codecov code lives in the Codecov plugin

Follow-up to `tech-coverage-and-cache-providers` (#2167, epic #2147). That spec put Codecov's token and repo checks in
`@theholocron/holocron-plugin-codecov`. This one moves the rest of what Holocron does with Codecov in as well, so a swap
to another coverage service is one provider entry and one plugin.

## Problem

- **The upload is shell.** `ci/actions/codecov-upload/action.yml` is about 140 lines: it downloads the Codecov CLI and
  verifies its GPG signature and checksum, fetches a fresh OIDC token before every upload (the token lives about five
  minutes, and about eighty uploads take longer), runs `create-commit`, `create-report` and `do-upload`, rewrites each
  report's `SF:` paths to start at the repo root so Codecov can place them, leaves out a report that names no source file,
  and retries with a wait. It has no unit test, and the rules in it (the path rewrite above all) are the kind that break
  without notice.
- **The config and the statuses sit in astromech.** `generators/codecov` and `templates/codecov/codecov.yml` write
  `codecov.yml` (flags and components, one per release group), and the aggregate-check and required-check generators name
  the `codecov/patch*` statuses.

## Options

|                  | A. Plugin owns upload, statuses and config                                | B. Plugin owns the upload only              | C. Leave it                               |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Swap the service | one provider entry and one plugin                                         | still edits the generators and status names | edits the action, generators and statuses |
| Tested           | upload rules become pure functions with tests                             | same for the upload                         | the shell stays untested                  |
| Cost             | a capability method, a command, and the generators read from the provider | a capability method and a command           | none                                      |
| Reversible       | the capability method is API, so hardest                                  | same                                        | easy                                      |

## Decision

**A, in three steps, each its own PR.** The first removes the largest and riskiest piece of hand-written code, so it
ships alone.

1. **Upload.** `Coverage` gains `upload(input)`. `holocron upload coverage --uploads <json>` (a `workspace` command) loads
   the `coverage` provider and calls it, and the action's steps shrink to that one command. In the plugin:
   - the Codecov CLI is run through a `shell.ts` (the `spawnSync` wrapper the 1Password plugin uses, token in the
     environment and never in argv);
   - the download, the checksum and the signature check are one function that takes the file bytes and the expected
     digest, so the check is tested without the network;
   - the path rewrite, the "names no source file" filter, the glob handling and the retry with its wait are pure functions
     with tests;
   - the OIDC token is fetched through an injected function, once before every try, and masked in the Actions log.

   It stays authenticated by OIDC, with no stored token. The `holocron` composite action already runs the reusable
   workflows' work, so the CLI is present in the jobs that upload.

2. **Status names.** The aggregate-check and required-check generators read the status contexts (`codecov/patch`, the
   per-flag ones) from the provider, through an optional `Coverage.statusContexts()`, instead of spelling them.
3. **Config file.** `codecov.yml` comes from the provider as well, through an optional `Coverage.configFiles()` that takes
   the workspace's flags and components. See the open question below.

```ts
interface Coverage extends ProviderIdentity {
  readonly key: "coverage";
  checkToken(): Promise<CoverageTokenCheck>;
  checkRepo?(input: CoverageRepoInput): Promise<CoverageRepoReport>;
  /** Uploads the reports, one flag per group. Names and counts only; never a token. */
  upload?(input: CoverageUploadInput): Promise<CoverageUploadResult>;
  /** The status contexts the provider reports on a pull request. */
  statusContexts?(input: CoverageStatusInput): CoverageStatusContext[];
  /** The provider's own config files for a repo, from its flags and components. */
  configFiles?(input: CoverageConfigInput): Promise<Record<string, string>>;
}
```

## What does not move

- **Turbo.** Its remote-cache service parts (token, team, status) are in the `cache` plugin already. `turbo.json`, `turbo
run` and the affected-task logic are astromech's task runner, which is built on Turbo and is not a cache provider.
- **The `setup` action's Turbo warning.** It is a shell check that costs nothing, runs before the CLI is built in this
  repo, and is read in every job. It stays; the plugin's probe and `doctor tokens` check the same condition.

## Risks

- The upload is on the required path for every pull request. The first PR keeps the old shell action and adds the command
  beside it, switches this repo's workflows to the command in a second commit, and is only merged with a green
  `codecov/patch` on a real pull request.
- The reusable workflows in `theholocron/.github` are frozen copies that keep calling the old action until `CI_HOME` moves
  to `ci-v1` (see AGENTS.md), so the old action stays until then.

## Open questions

1. `generateRepoFiles()` needs no provider by design, since `setup`, `sync` and `probe generated check` share it. Step 3
   needs the `coverage` provider to write `codecov.yml`. Either the plugin exports the generator as a pure function that
   `generateRepoFiles()` is handed through an optional argument (the generator stays provider-free), or the check loads
   the provider. Recommendation: the optional argument, so nothing that runs without a provider changes.
2. Does the upload command also belong to `measure:bundle`, which sends bundle stats with `HOLOCRON_CODECOV_UPLOAD_TOKEN`? It
   uploads through the Codecov CLI as well. Recommendation: not in the first PR; add `Coverage.uploadBundle?()` when this
   one has shipped.

## Decision log

- Codecov's upload, status names and config belong in the plugin (decided with the user in the session of #2238): do all
  three steps; keep Turbo's task-runner use in astromech and the `setup` warning as it is.
- Step 1 (upload) shipped in #2242 and #2243. Step 2 (status names) is the pull request that moves this spec to
  `accepted`: `Coverage.statusContexts?()` takes the components and the documentation mode and returns
  `{ name, required }` contexts; astromech takes them as an optional argument and keeps the old `codecov/` prefix as
  its default when no provider is loaded. Step 3 (`codecov.yml`) shipped (the pull request that closes open question 1 with the recommended optional
  argument): `Coverage.configFiles?(input)` takes `{ components: { id, path }[], flags, documentation, existing(path) }` and
  returns `Record<path, text>`; it is synchronous (pure, nothing to await), where the sketch above says `Promise`.
  `generateRepoFiles()` takes the files as an optional `coverageConfigFiles` function (`coverageConfigFiles()` in the CLI
  builds it from the provider) and, **with none supplied (no provider loaded or no method), writes no coverage config**: a
  skipped `write coverage config` step, an existing `codecov.yml` left as it is. A repo that declares no `coverage`
  provider therefore no longer gets a scaffolded `codecov.yml` from `setup`; the alternative (keeping a second copy of the
  generator in astromech as the default) would have left the file in two places and defeated the move, so it was not
  taken. Astromech keeps `readWorkspacePackages()`, `codecovFlagNames()`, `codecovUploads()`, `packageLocation()` and
  `DOCUMENTATION_FLAG`, which the uploads list, `coverageExpectations()` and the status contexts read. This repo's
  `codecov.yml` is unchanged byte for byte. All three steps are done (#2242, #2243, #2246, #2247), and the spec is
  archived. A repo that spreads `docsPreset()` still needs the provider declared: that is #2248.
