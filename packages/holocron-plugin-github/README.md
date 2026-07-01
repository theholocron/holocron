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

```bash
pnpm add -D @theholocron/holocron-plugin-github@alpha
```

## Auth

The plugin requires a GitHub token resolved in this order:

1. `--token <PAT>` flag on the `holocron` invocation
2. `HOLOCRON_GH_TOKEN` env var
3. `GITHUB_TOKEN` env var (auto-injected in GitHub Actions runners)

If none are set, the plugin throws a clear error pointing at the
options above. There is **no** `gh auth token` fallback because the
scopes that local `gh` auth has are usually narrower than what
admin-level holocron commands need (rulesets, repo settings, security
toggles, etc.) — silent fallback would surface as mysterious 403s.

## Config

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
