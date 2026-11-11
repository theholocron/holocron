---
id: SPEC-0081
status: draft
issue: theholocron/holocron#2062
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2061
  - theholocron/holocron#2065
  - theholocron/holocron#2072
discussion:
  url: https://discord.com/channels/1303969001822486568/1569978306252644392
---

# An organization secret names who can read it

## Problem

`holocron secrets sync` writes every organization secret with visibility `all`. The GitHub plugin sets it in code
(`if (scope.kind === "organization") body.visibility = "all"`), so every repository of the organization can read
`HOLOCRON_ADMIN_TOKEN`, `HOLOCRON_ORG_TOKEN`, `HOLOCRON_RELEASE_TOKEN` and the rest, including the public template
repositories. A token that can push to every repo is readable by a workflow in a repo nobody watches.

Most repositories of this organization are public, so the GitHub visibility `private` (every private repository) does
not help: `holocron` itself is public. The working option is `selected` with a list of repositories.

## Decisions

The rules come from the #2058 discussion; this spec only adds the shape.

1. **A concealed value (a secret) is never `all`.** An organization-scope entry of `repo.secrets.sync` must name its
   readers: `visibility: "selected"` and a non-empty `repos` list. Without them the config does not load (a
   `ConfigError`, the same fail-closed rule as the deployment allowlist, #2061). `visibility: "all"` and
   `visibility: "private"` on a secret are errors too, with a message that points at `selected`.
2. **An unconcealed value (a variable) defaults to `all`**; `private` stays allowed (it already is). `selected` for
   variables is not built (open question 1).
3. **Entry shape.** `repo.secrets.sync` entries gain two optional fields, valid only when `scope` is `org=<name>`:

   ```ts
   { layer: "ci", scope: "org=theholocron", visibility: "selected", repos: ["holocron", ".github"], keys: [...] }
   ```

   `repos` are repository names in the entry's organization. `"theholocron/holocron"` is accepted and must name the
   same organization as the scope; the owner is stripped. `visibility` may be left out when `repos` is given
   (`selected` is the only value that works). `repos` or `visibility` on a `repo` or `env=` scope is a `ConfigError`.

4. **One entry per reader list.** Visibility belongs to the secret, so the entry that has the list is the entry that
   writes it. The same key in two entries of the same scope is allowed by the loader but the last write wins; the
   validator rejects a key listed at the same organization scope twice with different reader lists.
5. **Resolving names.** The GitHub plugin resolves each name to an id through `GET /repos/{org}/{name}`
   (`@theholocron/github-client`, `repos.getRepo`, the `id` field), then writes
   `{ encrypted_value, key_id, visibility: "selected", selected_repository_ids }`. A name that does not resolve fails
   the row of every secret that needs it, naming the repository; nothing is written for that secret, and nothing is
   skipped silently. Resolution happens once per run per name. A dry run resolves too (it only reads), so a typo
   shows in the dry run.
6. **A secret that already exists with other readers.** GitHub replaces visibility on every write, so the sync does
   too. Before writing, the sync reads the organization's secrets (`listSecretAccess`, an optional `Secrets` method:
   name, visibility and, for `selected`, the repositories' names) and puts the difference in the row, by name: for
   example `HOLOCRON_ORG_TOKEN: all -> selected [holocron, .github]` or `selected [holocron] -> selected [holocron,
.github]`; a secret already as declared says `unchanged`, a secret that does not exist yet says `new`. The dry run
   prints the same line, so the change is visible before it is made. If the listing cannot be read (a token without
   the scope), the sync goes on without the difference and says so once; it never blocks the write.
7. **`Secrets.setSecret(scope, ...)`** keeps its signature. The organization variant of `SecretScope` gains optional
   `visibility` (`"all" | "private" | "selected"`) and `repos`. The sync always passes `selected` and the names. A caller
   that passes none (`secret set --scope org=...`, `notifications setup`) keeps today's `all`, see Notifications.
8. **Doctor.** `doctor secrets` adds, for the organization-scope synced entries:
   - `org-secret-access`: one row per organization (names only). It reports by name how many secrets sit at each
     reader list (for example `9 selected [holocron, .github]; 5 selected [holocron]`) and fails, naming the secret, when
     a secret is readable by more than its entry says (visibility `all`, `private`, or `selected` with an extra
     repository) or by fewer (a repository from the entry is not on the list). A secret that does not exist is the
     existing "exist" row's finding, not this one's.
   - `org-secret-shadowed`: a name that exists at both repository and organization level fails, naming it, because the
     repository secret overrides the organization one and keeps the old value after a rotation.
     The row is skipped when the repository's secrets cannot be listed.
     Both rows are skipped, with the reason, when the provider cannot report access (`listSecretAccess` is optional) or
     the token cannot read it. Values are never read; GitHub does not return them.
9. **Variables in the doctor** already compare visibility (`doctor variables`, `syncVariableChecks()`); nothing new.

## The organization secrets of this repository

`.holocron/repo.ts` splits its organization entry in two, each with a reader list. Evidence is the workflows of every
repository of the organization (the reads in the `theholocron/.github` reusables included), checked for the PR.

- Read by `holocron` and `.github`: `HOLOCRON_ADMIN_TOKEN`, `HOLOCRON_AXIOM_TOKEN`, `HOLOCRON_DEPLOY_TOKEN`,
  `HOLOCRON_FERN_TOKEN`, `HOLOCRON_ISSUES_TOKEN`, `HOLOCRON_ORG_TOKEN`, `HOLOCRON_READ_TOKEN`, `HOLOCRON_RELEASE_TOKEN`,
  `HOLOCRON_SYNC_TOKEN` -> `selected [holocron, .github]`.
- Read only by `holocron`'s own reusable workflows: `HOLOCRON_CLOUDFLARE_TOKEN`, `HOLOCRON_CODECOV_TOKEN`,
  `HOLOCRON_SENTRY_AUTH_TOKEN`, `HOLOCRON_TURBO_TOKEN`, `SENTINEL_GITHUB_APP_PRIVATE_KEY` -> `selected [holocron]`.

The template repositories call the frozen reusables in `theholocron/.github` (`release`, `sync`, `wiki`) with
`secrets: inherit`, and those read names of the first list. Narrowing the list can stop a template's run from seeing a
token. The PR body carries the table; the lists are not widened without the maintainer's choice.

## Notifications

`notifications setup` writes `HOLOCRON_NOTIFY_*` through the same `setSecret` with a scope that carries no reader
list, so it keeps `all` for now. It is a follow-up and not part of this change: the layout needs a `readers` field
(who reads the webhooks: `holocron` and `.github`), a design of its own, and moving them to `selected` today would
make `setup` fail until the layout has it. Until then `doctor secrets` does not check them (they are not in
`repo.secrets.sync`).

## Not in scope

- Deleting a stale repository copy of an organization secret: the sync never deletes. The shadow row finds it.
- `selected` visibility for organization variables (open question 1).
- Environment-scope and repository-scope secrets, which have no visibility.

## Open questions

1. Should `repo.variables.sync` also take `visibility: "selected"` and `repos`? Variables are not concealed and default
   to `all`, so nothing needs it today; the organization-variable write path would need the same id resolution.
2. Should `visibility: "private"` be allowed on a secret? It reads as "every private repository", which is a list the
   entry does not name; the decision above rejects it. A private-only organization could want it.
3. Should the shadow row also check variables (a repository variable overrides an organization one)?
4. The notification secrets (`HOLOCRON_NOTIFY_*`): a `readers` field on the layout, or a `repo.secrets.sync` entry for
   them? Follow-up.
5. A new repository that needs a secret has to be added to its entry by hand and synced. Should `repo setup` do it?
