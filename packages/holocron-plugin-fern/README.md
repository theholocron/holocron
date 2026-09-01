<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-fern`

Fern plugin for [Holocron](../cli). Implements the `wiki` capability for
engineering knowledge publishing via [Fern](https://buildwithfern.com).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-fern

```

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    // Short form — org name inferred from config.org
    "wiki": "fern",

    // With custom domain — all repos share wiki.theholocron.dev/<reponame>
    "wiki": ["fern", { "domain": "wiki.theholocron.dev" }],

    // With an explicit basepath
    "wiki": ["fern", { "domain": "wiki.theholocron.dev/myrepo" }],

    // When the Fern workspace slug differs from config.org
    "wiki": ["fern", { "domain": "wiki.theholocron.dev", "fernOrg": "holocron" }],
  },
}

```

### Options

| Option     | Required | Description                                                                                                                                                                |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`   | No       | Base domain (`"wiki.theholocron.dev"`) or full path (`"wiki.theholocron.dev/myrepo"`). When a base domain is given, the repo name is appended automatically as a basepath. |
| `fernOrg`  | No       | Fern workspace slug. Defaults to `config.org`. Set this when the Fern workspace name differs from the GitHub org (e.g. workspace `"holocron"`, org `"theholocron"`).       |

## What `holocron setup` does

1. **Writes `fern/fern.config.json`** — Fern workspace org name and pinned
   CLI version. Always overwritten.
2. **Updates `fern/docs.yml`** — On first run, scaffolds the file with
   instance URL, optional custom domain, and navigation stubs. On subsequent
   runs, updates only the `instances:` block (URL, `custom-domain`,
   `multi-source`) while leaving hand-edited navigation, colors, and layout
   untouched.
3. **Provisions DNS** — When a `domain` is set and a `dns` provider is
   configured, upserts a CNAME record pointing the hostname at
   `<fernOrg>.docs.buildwithfern.com`.

Both `fern/` files must be committed — the CI workflow reads them at deploy time.

## Custom domain and multi-source routing

When `domain` is a bare host, the plugin appends the repo name as a
basepath so every repo in the org gets its own URL under a shared domain:

```yaml
# Generated fern/docs.yml for repo "theholocron/holocron"
# with domain: "wiki.theholocron.dev"
instances:
  - url: theholocron.docs.buildwithfern.com/holocron
    custom-domain: wiki.theholocron.dev/holocron
    multi-source: true
```

DNS: add one CNAME record — `wiki.theholocron.dev` →
`theholocron.docs.buildwithfern.com`.

## Password protection

Password protection is configured in the **Fern Dashboard**
(`dashboard.buildwithfern.com`) — it is not configurable via `docs.yml` or
any CLI flag. Configure access control manually in the dashboard after
running `holocron setup`.

## CI secrets

Add `HOLOCRON_FERN_TOKEN` to your repo's GitHub Secrets. The `wiki.yml` thin caller
passes it to the Fern CLI during `fern generate --docs`.

| Secret                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `HOLOCRON_FERN_TOKEN` | Fern workspace API token for `fern generate` |

Generate a token at `dashboard.buildwithfern.com` under **Settings → API tokens**.

## What `wiki` provides

- `provision(opts?)` — writes `fern/fern.config.json` and scaffolds
  `fern/docs.yml` (skipped if already present).
