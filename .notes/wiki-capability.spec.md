---
status: draft
issue: theholocron/holocron#474
blocked-by: []
related:
  - theholocron/holocron#440
  - theholocron/holocron#445
  - theholocron/holocron#446
  - theholocron/.github-private#65
  - theholocron/holocron/.notes/knowledge-system.spec.md
research:
  - Fern docs.yml JSON schema: https://schema.buildwithfern.dev/docs-yml.json
  - Fern multi-source example: NVIDIA/OpenShell fern/docs.yml
  - Password protection: https://buildwithfern.com/learn/docs/authentication/setup/password-protection
---

# Wiki capability — engineering knowledge publishing

Defines the `wiki` capability in the holocron provider system: a swappable
provider for publishing the engineering knowledge surfaces (`docs/decisions/`,
`docs/engineering/`) as a browsable, access-controlled, agent-readable site.

---

## Why a separate capability

The existing `docs` config provisions GitHub Pages for **consumer-facing**
package documentation — API references, guides, changelogs. The `wiki`
capability serves a different audience with different requirements:

| Concern      | `docs` (Pages)              | `wiki` (this spec)             |
| ------------ | --------------------------- | ------------------------------ |
| Audience     | npm consumers, contributors | Internal engineers, AI agents  |
| Content      | Package APIs, guides        | ADRs, specs, runbooks          |
| Access       | Public                      | Password-protected or org-only |
| Agent access | Not required                | MCP endpoint, `llms.txt`       |
| Lifecycle    | Ships with each release     | Separate from release cycle    |

Conflating them would force every consumer-facing docs site to carry
access-control configuration it doesn't need, and vice versa.

---

## Capability definition

**Key:** `wiki`
**Cardinality:** single (one wiki provider per repo)
**Required:** no — repos without engineering knowledge surfaces skip it

Configured under `providers` in `holocron.config.ts` — the same entry point
as all other capability providers:

```ts
providers: {
  // Short form
  wiki: "fern",

  // Tuple form with options
  wiki: ["fern", { domain: "wiki.theholocron.dev" }],
}
```

---

## Providers

### `fern` (primary recommendation)

Fern is a Git-backed docs platform. It reads directly from the repository,
produces a rendered docs site, and provides:

- Password protection (configured in the Fern Dashboard — see below)
- Hosted MCP endpoint (`wiki.theholocron.dev/<repo>/_mcp/server`)
- Raw Markdown access (`wiki.theholocron.dev/<repo>/decisions/0001.md`)
- `llms.txt` emission for agent discovery
- Deployment on every push to `main`

**What `holocron setup` does:**

1. Writes `fern/fern.config.json` — Fern workspace org name and pinned CLI
   version. Always overwritten so the version stays current.
2. Scaffolds `fern/docs.yml` — instance URL, optional custom domain, and
   navigation pointing at `docs/decisions/` and `docs/engineering/`. Skipped
   if the file already exists so hand-edited navigation is preserved.
3. Adds `wiki.yml` as a thin CI caller (publish on push to main, Fern preview
   on pull_request) when `"wiki"` is in the `workflows` array.

**`fern/` files are committed** — the Fern CLI reads them at deploy time.
They are not gitignored.

**Custom domain and multi-source routing (researched)**

Fern supports hosting multiple repos under a single custom domain via
basepath-aware routing. When `domain` is set to a bare host
(e.g. `"wiki.theholocron.dev"`), `holocron setup` automatically derives
the per-repo basepath from the repo name and emits:

```yaml
instances:
  - url: theholocron.docs.buildwithfern.com/holocron
    custom-domain: wiki.theholocron.dev/holocron
    multi-source: true
```

This gives every repo in the org its own path under a single shared domain:
`wiki.theholocron.dev/holocron`, `wiki.theholocron.dev/configs`, etc.
DNS: one CNAME record — `wiki.theholocron.dev` → `theholocron.docs.buildwithfern.com`.

You can also supply the full path explicitly:
`domain: "wiki.theholocron.dev/myrepo"`.

**Password protection (researched — dashboard-only)**

Fern's `docs.yml` schema has **no password or auth fields**. Password
protection is configured exclusively through the Fern Dashboard
(`dashboard.buildwithfern.com`). It cannot be automated by `holocron setup`.
After running setup, configure access control manually in the dashboard.

**Secrets required:**

| Secret       | Purpose                                      | Where set     |
| ------------ | -------------------------------------------- | ------------- |
| `FERN_TOKEN` | Fern workspace API token — used by `wiki.yml` CI workflow | GitHub secret |

**Provider options:**

```ts
providers: {
  wiki: ["fern", {
    domain?: string,  // base host ("wiki.theholocron.dev") or full path ("wiki.theholocron.dev/myrepo")
  }],
}
```

---

### `mintlify`

Mintlify is a close second to Fern with similar capabilities. One open
question: the Starter plan pricing page says authentication is included,
but the auth documentation says it requires Pro. Verify before standardizing.

**What `holocron setup` does:**

1. Writes `mint.json` config pointing at `docs/decisions/` and
   `docs/engineering/`
2. Connects the repo via `MINTLIFY_TOKEN`
3. Configures custom domain and auth if options are set

**Secrets required:** `MINTLIFY_TOKEN`

---

### `github`

The built-in GitHub Wiki. Simpler but lacks MCP endpoint, password
protection, and `llms.txt`. Suitable for public OSS projects that don't
need access control.

**What `holocron setup` does:**

1. Enables the Wiki via the GitHub API (if not already enabled)
2. Syncs `docs/decisions/README.md` and `docs/engineering/README.md` as
   Wiki index pages via `auto-commit` + push to the Wiki remote

**Secrets required:** `GITHUB_TOKEN` (already available in CI)

---

## What gets published

The wiki capability renders the engineering knowledge surfaces that
`holocron setup` provisions when `docs` is configured:

```
docs/
  decisions/          ← ADRs — "why we built it this way"
  engineering/
    specifications/   ← Accepted specs (graduated from .notes/)
    standards/        ← Org-wide engineering standards
    runbooks/         ← Operational runbooks
```

Content not published (remains in the repository only):

- `.notes/` — draft specs and working documents
- `docs/` consumer-facing content — served by the Pages (`docs`) config,
  not the wiki provider

---

## `holocron setup` integration

The wiki step runs after the `docs` step and before the `skills`/`prompts`
steps. It is skipped entirely when `wiki` is absent from the config.

```
setup order:
  ...
  docs       → GitHub Pages for consumer docs
  wiki       → engineering knowledge platform  ← new
  skills     → .agents/skills/
  prompts    → .agents/prompts/
  engineering → docs/decisions/, docs/engineering/ stubs
```

The step is local when it only writes config files (Fern, Mintlify), and
remote when it calls a provider API (GitHub Wiki enable).

---

## Open questions

1. **Fern CLI version pinning** — Fern's configuration schema (`fern.config.json`,
   `docs.yml`) evolves quickly. `fern.config.json` pins the version
   (`FERN_VERSION = "5.35.4"` in the plugin); bump it in lockstep with the
   `fern-version` default in `wiki.yml`.

2. **Mintlify auth availability** — Confirm whether Starter plan includes
   authentication before implementing the Mintlify provider.

3. **Agent discoverability** — Should `holocron setup` also write an
   `llms.txt` at the repo root pointing at the wiki MCP endpoint? This
   would let agents auto-discover the engineering knowledge surface.

4. **Spec graduation workflow** — How does an accepted spec move from
   `.notes/` to `docs/engineering/specifications/`? Manual PR, or a
   `holocron docs graduate <spec>` command?

5. **`github` provider reusable workflow** — Should the CI sync step for the
   GitHub Wiki provider be a reusable workflow in `theholocron/.github`, or
   is it provider-specific enough to live in the CLI setup step only?

---

## Acceptance criteria

- [x] `providers.wiki: "fern"` in `holocron.config.ts` causes `holocron setup`
      to write `fern/fern.config.json` and scaffold `fern/docs.yml`
- [x] `"wiki"` in the `workflows` array writes the `wiki.yml` thin caller
      (publish on push to main, Fern preview on pull_request)
- [x] `domain: "wiki.theholocron.dev"` produces multi-source routing:
      `wiki.theholocron.dev/<reponame>` with `multi-source: true`
- [x] `holocron setup` is idempotent: `fern.config.json` is overwritten safely;
      `fern/docs.yml` is skipped if it already exists
- [x] Provider is swappable with a one-line config change — no code changes
- [ ] `providers.wiki: "github"` enables the GitHub Wiki and syncs index pages
- [ ] Password protection configured in Fern Dashboard (manual step — cannot
      be automated; document in `docs/tokens.md` or a runbook)
- [ ] `FERN_TOKEN` secret documented in `docs/tokens.md` with required scopes
- [ ] Closes #65 (AI workflow published to chosen wiki surface)
- [ ] Closes #446 (Fern trialed as the primary wiki provider)
