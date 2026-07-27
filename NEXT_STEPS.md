# Next Steps — Token Migration

**Delete this file once all tokens are created, stored, and verified.**

This checklist tracks the migration from a single broad GitHub token to per-feature fine-grained PATs.

## 1. Create fine-grained PATs

Go to <https://github.com/settings/tokens> → "Generate new token (fine-grained)".

Set resource owner to the `theholocron` org and configure each token with only the scopes listed below.

| Token            | Description                                                       | Required scopes                                                                 |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `github.read`    | `clone`, `ci` capability                                          | `contents: read`, `actions: read`, `metadata: read`                             |
| `github.issues`  | `issues` capability                                               | `issues: read/write`, `metadata: read`                                          |
| `github.sync`    | `sync-github` command                                             | `contents: read/write`, `pull_requests: read/write`, `workflows: read/write`    |
| `github.release` | semantic-release, GitHub releases                                 | `contents: read/write`, `issues: read/write`, `pull_requests: read/write`       |
| `github.admin`   | `setup`, `source`, `secrets`, `environments` capabilities         | `administration: read/write`, `secrets: read/write`, `environments: read/write` |

## 2. Store tokens in the local keyring

```sh
holocron auth set github.read     ghp_<read-token>
holocron auth set github.issues   ghp_<issues-token>
holocron auth set github.sync     ghp_<sync-token>
holocron auth set github.release  ghp_<release-token>
holocron auth set github.admin    ghp_<admin-token>
```

## 3. Update CI secrets

In each theholocron repo's GitHub Actions settings, ensure these secrets exist:

- `SYNC_TOKEN` — maps to `HOLOCRON_SYNC_TOKEN` via the `sync-github.yml` workflow `env:` block
- `RELEASE_TOKEN` — maps to `HOLOCRON_RELEASE_TOKEN` via the `release.yml` workflow `env:` block

No secret renames are needed — the workflow templates already map these to the correct env var names.

## 4. Smoke-test each feature

- [ ] `holocron clone theholocron` — exercises `HOLOCRON_READ_TOKEN`
- [ ] `holocron issues list` — exercises `HOLOCRON_ISSUES_TOKEN`
- [ ] `holocron sync-github --dry-run` — exercises `HOLOCRON_SYNC_TOKEN`
- [ ] `holocron setup --dry-run` — exercises `HOLOCRON_ADMIN_TOKEN`
- [ ] Push to a release branch and confirm CI release workflow succeeds — exercises `HOLOCRON_RELEASE_TOKEN`

## 5. Rotate / revoke the old broad token

Once all smoke tests pass, revoke any previously used broad PATs from <https://github.com/settings/tokens>.

## 6. Delete this file

```sh
rm NEXT_STEPS.md
git commit -s -m "chore: remove token migration checklist"
```
