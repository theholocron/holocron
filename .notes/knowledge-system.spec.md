---
status: draft
issue:
blocked-by: []
related:
  - theholocron/holocron#440
  - theholocron/holocron#442
  - theholocron/skills#66
  - theholocron/.github-private#65
  - theholocron/holocron/.notes/docs-architecture.spec.md
  - theholocron/holocron/.notes/ai-engineering-workflow.spec.md
---

# Engineering knowledge system — Git-canonical ADRs with Fern presentation

Defines the complete architecture for capturing, storing, and surfacing
engineering knowledge (ideas, specs, ADRs) across the theholocron org.
Git is the canonical store; a hosted docs platform (Fern preferred) provides
human and agent discovery.

> **Refines `.notes/docs-architecture.spec.md`** on one point: accepted ADRs
> and specs live in the repository as Markdown, not in the GitHub Wiki. The
> Wiki boundary table in that spec remains correct for everything else. This
> spec is authoritative on ADR and spec home going forward.

---

## Core principle

> No architectural knowledge is canonical merely because it exists in a docs
> platform, a Discussion, an Issue, Slack, or an AI conversation. Accepted
> architectural decisions become canonical only when merged as an ADR into Git.

The presentation layer is replaceable. The workflow and the files are not.

---

## Motivation

The previous research established the surface-boundary table (Astro docs vs
README vs Wiki vs Issues) and noted the repo-vs-Wiki question for ADRs as open.
A second research pass on GitHub-backed documentation platforms resolved it.

The key insight: the goal is not "find a nicer wiki." It is "keep engineering
knowledge in GitHub, then project that knowledge into a better human and agent
interface." That distinction removes most traditional wiki products from
consideration — the tool should not own the ADRs, Git should.

A hosted platform that renders Git-backed Markdown gives you:
- portability (switch platforms without migrating documents)
- review (ADR changes go through PR, not a wiki edit)
- agent access (MCP endpoints, `llms.txt`, raw Markdown URLs)
- human access (search, navigation, sidebar, dark mode)

---

## Platform evaluation

| Option | Free tier | Private source repo | Private rendered docs | Git direction | MCP / agent | Markdown portable | Fit |
|---|---|---|---|---|---|---|---|
| **Fern** | ✅ 2 platform users | ✅ | ✅ Password protection | Git-first; web edits become PRs | ✅ Excellent | ✅ `.md/.mdx` | **9.5/10** |
| **Mintlify** | ✅ 5 editor seats | ✅ | 🟡 Verify — pricing page conflicts with auth docs | Git-first; editor creates PRs | ✅ Excellent | ✅ `.md/.mdx` | **9/10** |
| **Starlight + Cloudflare** | ✅ Effectively free | ✅ | ✅ Cloudflare Access (≤50 users free) | Pure Git → deploy | ✅ Bring-your-own MCP | ✅ Pure Markdown | **9/10** |
| **GitBook** | ✅ 1 user | ✅ | ❌ Free published docs effectively public | True two-way Git sync | ✅ Built-in | ✅ Markdown | **7/10** |
| **Confluence** | ✅ ≤10 users | — | ✅ | API rather than Git sync | 🟡 | 🟡 Proprietary | **6/10** |
| **ReadMe** | ✅ | ✅ | ❌ Private docs require $250/mo Pro | Two-way Git sync | ✅ Built-in | ✅ Markdown | **6/10** |

### Recommendation: Fern first, Mintlify second, Starlight fallback

**Fern** is the primary recommendation. Its documentation system is built around
Git rather than offering Git export as an escape hatch. Web edits create GitHub
PRs; the repository stays authoritative; deployment follows the merged state.

Free Hobby tier includes:
- 2 Fern team members (developers not needing Fern accounts use Git directly)
- Custom domain
- Password-protected docs
- Guides, API references, changelogs, API explorer, web editor
- `llms.txt` emission
- Hosted MCP endpoint at `engineering.example.com/_mcp/server`
- Raw Markdown at `engineering.example.com/adrs/0023.md`

The Fern REST API for search/AI is Team/Enterprise only — not a blocking issue.
Automation targets GitHub's API rather than the docs vendor's CRUD API.

**Mintlify** is the close second. Free Starter includes 5 editor seats, Git sync,
MCP server, custom domain, web editor. One open question: its pricing page says
Starter includes authentication but its auth documentation says Pro — verify
before committing.

**Starlight + Cloudflare Access** is the self-hosted fallback with zero vendor
dependency. Astro is already familiar. Cloudflare Pages free tier (500 builds/mo)
plus Cloudflare Access Zero Trust (≤50 users free) gives you a fully private docs
site authenticated against GitHub org membership. The agent layer uses the repo
directly rather than an MCP endpoint.

---

## Full architecture

```
                        GITHUB
                           │
        ┌──────────────────┼────────────────────┐
        │                  │                    │
        ▼                  ▼                    ▼
      Issues          Discussions              PRs
        │                  │                    │
      Ideas             Proposed             Specs /
      Tasks                ADRs               ADRs
        │                  │                    │
        └──────────────────┴─────────┬──────────┘
                                     │
                                     ▼
                              Repository
                                     │
                     ┌───────────────┴──────────────┐
                     │                              │
             docs/specifications/        docs/architecture/adr/
                                                    │
                                        ┌───────────┴───────────┐
                                        │                       │
                                        ▼                       ▼
                                  Human knowledge         Agent knowledge
                                        │                       │
                                   Fern / Mintlify             MCP
                                   / Starlight             GitHub / repo
```

The docs platform is a rendering layer. It observes and presents — it is not
where decisions are created or stored.

---

## Repository layout

```
.github/
├── DISCUSSION_TEMPLATE/
│   └── architecture-decision.yml
├── ISSUE_TEMPLATE/
│   ├── idea.yml
│   ├── specification.yml
│   └── implementation.yml
└── workflows/
    ├── docs.yml
    └── adr-check.yml

docs/
├── architecture/
│   ├── README.md
│   └── adr/
│       ├── template.md
│       ├── 0001-use-postgresql.md
│       ├── 0002-adopt-opentelemetry.md
│       └── ...
├── engineering/
│   ├── standards/
│   ├── practices/
│   └── runbooks/
└── specifications/
    └── ...
```

**Ideas** stay in Issues or Project items until they mature — too early to deserve
a long-lived Markdown document.

**Specs** live in `docs/specifications/` once substantial enough to commit.
They capture what is being built and what success means.

**ADRs** live in `docs/architecture/adr/`. One file per decision, sequentially
numbered. A single spec may produce several ADRs:

```
SPEC: "Agents need access to engineering knowledge"
│
├── ADR-0042  Store architectural decisions as Markdown in Git
├── ADR-0043  Expose engineering documentation through MCP
└── ADR-0044  Authenticate internal documentation through org identity provider
```

---

## ADR frontmatter schema

Every ADR file begins with machine-readable YAML frontmatter:

```yaml
---
id: ADR-0042
title: Store Architectural Decisions as Markdown in Git

status: accepted   # proposed | accepted | rejected | deprecated | superseded
date: 2026-08-27

owners:
  - platform

specs:
  - SPEC-0018

discussion:
  github: 183      # GitHub Discussion number

supersedes: []
superseded-by: []

tags:
  - architecture
  - documentation
  - developer-experience
  - ai
---
```

The body is intentionally plain and portable:

```markdown
# Context

Why are we making this decision?

# Decision

What did we decide?

# Considered Options

## Option A

### Pros
### Cons

## Option B

### Pros
### Cons

# Consequences

## Positive
## Negative

# References
```

The frontmatter belongs to the org, not to the presentation platform. Fern,
Mintlify, Starlight, GitHub Actions, and agents all consume the same file.

---

## GitHub Discussion template for ADRs

Architectural debate happens in a dedicated Discussion category
(`Architecture Decisions`) before the ADR is committed. The Discussion is
the messy deliberation; the ADR is the clean conclusion.

Template for `DISCUSSION_TEMPLATE/architecture-decision.yml`:

```markdown
# Proposed Decision

## Context

What architectural question are we trying to answer?

## Drivers

What constraints or goals influence the decision?

## Options Considered

### Option A

### Option B

### Option C

## Proposed Decision

What are we currently leaning toward, and why?

## Consequences

### Positive
### Negative
### Risks

## Related Specification

#<issue>

## Related ADRs

ADR-XXXX
```

When the Discussion reaches consensus:

```
Discussion (accepted)
      │
      ▼
ADR PR → docs/architecture/adr/0045-something.md
      │
      ▼
Merge → Fern renders it
```

The Discussion remains as historical record. The committed ADR is the canonical
statement.

---

## Agent knowledge precedence

Coding agents should know which artifacts to treat as authoritative and in what
order. Include this in AGENTS.md and in the `implement.md` prompt file:

```markdown
## Engineering knowledge precedence

When researching architecture or implementation:

1. Search accepted ADRs first — highest architectural authority.
2. Search the relevant specification — desired behavior.
3. Inspect the current implementation — current reality.
4. Check linked issues for active work.
5. Use GitHub Discussions for context and rationale, but do not treat
   proposals as accepted decisions.

Accepted ADRs override unresolved Discussion proposals.

If implementation conflicts with an accepted ADR, flag the discrepancy
rather than assuming the implementation represents the intended architecture.
```

---

## ADR validation GitHub Action

A PR check enforces ADR structure and metadata consistency:

```yaml
# .github/workflows/adr-check.yml
on:
  pull_request:
    paths:
      - "docs/architecture/adr/**"
```

Checks to run:

- `id` is present and unique across all ADR files
- `status` is one of: `proposed | accepted | rejected | deprecated | superseded`
- `title` is non-empty
- `discussion.github` references an existing Discussion (optional but warned if absent for `accepted`)
- `supersedes` entries reference existing ADR IDs
- No duplicate sequential numbers in filenames

Example passing output:

```
✓ ADR-0042 valid
✓ Linked discussion #183
✓ Linked specification SPEC-0018
✓ Status: accepted
✓ No duplicate ADR IDs
```

---

## Implementation

### theholocron/holocron — `holocron setup`

Provision the `docs/architecture/adr/` directory structure, the ADR template,
and the GitHub Issue and Discussion templates when setting up a new repo.

Relates to: issue #442 (prompt directory provisioning — same setup step, can
be delivered together or as a follow-on).

### theholocron/.github

Add `DISCUSSION_TEMPLATE/architecture-decision.yml` and update
`ISSUE_TEMPLATE/` with `idea.yml`, `specification.yml`, and
`implementation.yml` at the org level so all repos inherit them.

### theholocron/skills — `/adr` skill

The `/adr` skill (theholocron/skills#66) should:
1. Accept a GitHub Discussion number
2. Fetch the Discussion body via `gh api`
3. Apply the ADR Author prompt
4. Write output to `docs/architecture/adr/<next-id>-<slug>.md` with correct frontmatter

### Platform adoption (decision pending)

Trial Fern first against a real documentation branch. If the Mintlify
authentication discrepancy is resolved in Starter's favor, trial both in
parallel. Confirm before standardizing either as the org presentation layer.

---

## Open questions

1. **Fern vs Mintlify trial** — who sets up the trial, on which repo, and
   what criteria confirm success? Suggested: docs site for `theholocron/holocron`
   itself, criteria: password protection working, MCP endpoint reachable,
   ADR pages render with frontmatter parsed.
2. **`docs/architecture/adr/` vs `architecture/adr/` at repo root** — the
   research suggests `docs/` as the parent; confirm this does not conflict with
   existing Astro docs site paths for repos that have one.
3. **`holocron setup` scope** — should ADR directory provisioning be part of
   `setup` (runs every repo) or a new `holocron docs init` command (opt-in)?
4. **`docs-architecture.spec.md` reconciliation** — the Wiki-as-ADR-home
   position in that spec is superseded here. Update its status to `superseded`
   and add a `superseded-by` reference to this spec once accepted.
