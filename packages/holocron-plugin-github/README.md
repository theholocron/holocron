# `@theholocron/holocron-plugin-github`

GitHub plugin for [Holocron](../cli). Implements five capabilities
against the GitHub REST API:

| Capability     | What this plugin does                                            |
| -------------- | ---------------------------------------------------------------- |
| `source`       | Repos, rulesets, repo settings, security toggles, workflow files |
| `ci`           | Workflow run history + status                                    |
| `secrets`      | GH Actions secrets (repo + environment + organization)           |
| `environments` | Named deployment environments (reviewers, wait timers)           |
| `issues`       | GitHub Issues as a tracker (with lifecycle slots)                |

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-github@alpha

```

## Auth

Each capability resolves its own fine-grained token so a compromised credential can only affect that feature. The resolution chain per capability is:

```
--token flag → HOLOCRON_<FEATURE>_TOKEN → keyring("github.<feature>")
```

| Env var | Keyring key | Capabilities |
|---|---|---|
| `HOLOCRON_READ_TOKEN` | `github.read` | `clone`, `ci` |
| `HOLOCRON_ISSUES_TOKEN` | `github.issues` | `issues` |
| `HOLOCRON_SYNC_TOKEN` | `github.sync` | `sync-github` command |
| `HOLOCRON_RELEASE_TOKEN` | `github.release` | semantic-release, GitHub releases |
| `HOLOCRON_ADMIN_TOKEN` | `github.admin` | `source`, `secrets`, `environments` |

Store tokens once via the keyring so they are picked up automatically:

```sh
holocron auth set github.read     ghp_xxx
holocron auth set github.admin    ghp_yyy
# … one per feature
```

See [docs/tokens.md](../../docs/tokens.md) for full scope requirements and CI setup.

## Config

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "providers": {
    "source": "github",
    "ci": "github",
    "secrets": "github",
    "environments": "github",
    "issues": ["github", { "labels": { "inProgress": "status:in-progress", "inReview": "status:in-review" } }],
  },
}

```

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
All five capabilities are implemented; APIs may still shift before
stable v2.0.0.
