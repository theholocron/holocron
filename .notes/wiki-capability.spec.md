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

```ts
// Short form
wiki: "fern",

// Tuple form with options
wiki: ["fern", { domain: "engineering.theholocron.dev" }],
```

---

## Providers

### `fern` (primary recommendation)

Fern is a Git-backed docs platform. It reads directly from the repository,
produces a rendered docs site, and provides:

- Password protection (Hobby tier)
- Hosted MCP endpoint (`engineering.example.com/_mcp/server`)
- Raw Markdown access (`engineering.example.com/decisions/0001.md`)
- `llms.txt` emission for agent discovery
- Deployment on every push to `main`

**What `holocron setup` does:**

1. Connects the repo to Fern via `FERN_TOKEN`
2. Writes `fern/fern.config.json` pointing at `docs/decisions/` and
   `docs/engineering/`
3. Enables password protection if `FERN_PASSWORD` is set
4. Configures custom domain if `domain` option is provided
5. Adds the `fern/` directory to `.gitignore` managed block (generated config)

**Secrets required:**

| Secret          | Purpose                                   |
| --------------- | ----------------------------------------- |
| `FERN_TOKEN`    | API token for Fern workspace              |
| `FERN_PASSWORD` | Password for access protection (optional) |

**Provider options:**

```ts
wiki: ["fern", {
  domain?: string,      // custom domain (e.g. "engineering.theholocron.dev")
  password?: boolean,   // enable password protection (default: true)
  mcp?: boolean,        // enable MCP endpoint (default: true)
}]
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

1. **Fern config format** — Fern's configuration schema (`fern.config.json`,
   `docs.yml`) evolves quickly. Pin to a specific Fern CLI version in
   `holocron setup` to avoid breaking changes.

2. **Mintlify auth availability** — Confirm whether Starter plan includes
   authentication before implementing the Mintlify provider.

3. **Agent discoverability** — Should `holocron setup` also write an
   `llms.txt` at the repo root pointing at the wiki MCP endpoint? This
   would let agents auto-discover the engineering knowledge surface.

4. **Spec graduation workflow** — How does an accepted spec move from
   `.notes/` to `docs/engineering/specifications/`? Manual PR, or a
   `holocron docs graduate <spec>` command?

5. **Wiki as a reusable workflow** — Should the CI sync step (for GitHub
   Wiki) be a reusable workflow in `theholocron/.github`, or is it
   provider-specific enough to live in the CLI setup step only?

---

## Acceptance criteria

- [ ] `wiki: "fern"` in `holocron.config.ts` causes `holocron setup` to
      provision Fern config files and connect the repo
- [ ] `wiki: "github"` enables the GitHub Wiki and syncs index pages
- [ ] Provider is swappable with a one-line config change — no code changes
- [ ] `holocron setup` is idempotent: running it twice does not duplicate
      config or break an existing wiki connection
- [ ] Secrets are documented in `docs/tokens.md` with required scopes
- [ ] Closes #65 (AI workflow published to chosen wiki surface)
- [ ] Closes #446 (Fern trialed as the primary wiki provider)
