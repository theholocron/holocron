---
status: draft
issue:
blocked-by: []
related:
  - theholocron/holocron#440
  - theholocron/.github-private#65
  - theholocron/holocron/.notes/ai-engineering-workflow.spec.md
---

# Documentation architecture — Astro docs, README, Wiki, and Issues

Defines what each documentation surface is authoritative for across the
theholocron org, where content belongs, and what to avoid. The goal is a
hierarchy where every piece of information has exactly one home and all other
surfaces link to it.

---

## Motivation

Without a defined boundary, documentation accumulates in every surface
simultaneously. The Astro docs site becomes a dumping ground for engineering
archaeology. The Wiki gets populated with user-facing guides that belong
in the docs site. READMEs grow into mini-wikis. Institutional memory ends up
scattered across Astro, the Wiki, issues, and Slack threads, and none of it
can be trusted because nothing is authoritative.

The fix is to give each surface a specific job and then enforce it.

---

## Surface boundary

| Surface | Question answered | Audience |
|---|---|---|
| **Astro docs / GitHub Pages** | How do I use this? | Consumers, developers — potentially public |
| **README** | What is this and how do I get started? | Everyone |
| **GitHub Wiki** | Why is it built this way? How do we maintain and evolve it? | Org members / contributors |
| **Issues / Projects** | What are we doing next? | Contributors / team |
| **Code / PRs** | What changed and how does it work? | Developers |

The mental model:

```
README
   │  "What is this?"
   ▼
Astro Docs
   │  "How do I use it?"
   ▼
GitHub Wiki
   │  "Why did we build it this way?"
   ▼
Issues / PRs
      "What's changing?"
```

---

## Astro docs / GitHub Pages

**Authoritative for: how to use the project.**

Think of the Astro site as something that could be made public someday, even
if it is internal today. Content that would make sense on a public docs site
for a library or service belongs here.

Good candidates:

- Installation
- Getting started
- API reference
- Configuration and environment variables
- Usage examples
- Authentication integration (how to use it, not why it was designed that way)
- Deployment instructions (no sensitive internal detail)
- Troubleshooting
- Upgrade and migration guides
- Architecture overview (what the system does, not why it was designed that way)
- Public-facing diagrams
- Package and service dependencies

Test: if a new developer consuming the package needs this to get started or
stay unblocked, it belongs in the Astro docs.

---

## README

**Authoritative for: what is this and how do I get started.**

One page. Oriented toward someone landing on the repo for the first time.
Links out to the Astro docs for depth. Does not duplicate what the docs cover.

Content: name, one-line description, installation, basic usage, link to full
docs, link to changelog.

The `<!-- holocron:installation -->` marker block keeps installation and usage
sections synchronized with `package.json`. See `holocron sync-readme`.

---

## GitHub Wiki

**Authoritative for: institutional and engineering knowledge that contributors
need but consumers do not.**

The Wiki is the engineering notebook. Enable it on a repo only when that repo
has genuine institutional knowledge to record — ADRs, design specs, operational
runbooks, historical context. Leaving a Wiki empty is completely reasonable if
a repo does not accumulate that kind of content.

### Canonical Wiki structure

```
Home

Architecture/
    System Overview
    Data Flow
    Service Dependencies

ADRs/
    ADR-001 — [decision title]
    ADR-002 — [decision title]
    ...

Specs/
    [Feature or capability name]
    ...

Operations/
    Deployment Notes
    Debugging Production
    Known Issues and Workarounds
    Internal Infrastructure

Development/
    Release Process
    Versioning Conventions
    Migration Handling
    PR and Review Expectations
    Local Development Internals
    Repository Conventions
```

### What belongs in the Wiki

**Architecture Decision Records** — why PostgreSQL instead of X, why a
service boundary exists, why a particular auth architecture was chosen.
See §ADRs below and theholocron/holocron#440 for format.

**Design specs and RFCs** — original problem, requirements, proposed
architecture, alternatives considered, tradeoffs, open questions, final
decision. Accepted specs graduate from `.notes/` here.

**Architecture deep dives** — things contributors need to understand but
consumers do not: internal data flows, service ownership, dependency
relationships, historical constraints.

**Operational knowledge** — "if X happens in production, here is what we
normally investigate." Deployment quirks, dashboards to check, infrastructure
relationships, known limitations.

**Contributor and team process** — release process, versioning conventions,
how migrations are handled, ownership, PR and review expectations specific to
the project.

**Historical context** — previous architecture, deprecated approaches,
migration history, why something that looks strange exists.

---

## ADRs — repo vs. Wiki

This is the one surface where teams reasonably disagree, so the rule is made
explicit here.

**Argument for repo (`docs/adr/`):** an architecture decision is versioned
alongside the code it describes. Changing the code and the ADR happens in
the same PR, and the ADR is findable via `git log`.

**Argument for Wiki:** ADRs are institutional knowledge consulted
independently of any specific version. The Wiki has its own Git history.
ADRs do not need to be synchronized with code changes the way an API
reference does — they describe a decision made at a point in time, not a
current implementation detail.

**Decision rule:**

> If changing the code should normally require changing this document in the
> same PR → keep it in the repository.
>
> If it is primarily institutional knowledge that engineers consult
> independently of the current version → Wiki.

For ADRs, the code-change/doc-change coupling almost never applies. An ADR
records why a decision was made; it is not invalidated by implementation
changes unless a new superseding decision is made. That makes the Wiki the
right home.

The accepted spec (`.notes/ai-engineering-workflow.spec.md`) and this
document are both candidates to graduate from `.notes/` to the Wiki once
accepted. theholocron/holocron#440 tracks the format decision.

---

## Anti-pattern: duplication across surfaces

The most common failure mode is the same information appearing in multiple
places in slightly different forms, making none of them trustworthy.

**Do not do this:**

```
Astro docs: "How authentication works"
Wiki:       "How authentication works (internal)"
README:     "Authentication details"
```

**Instead — one authoritative source, links everywhere else:**

Astro docs (user-facing):
> Authentication is handled by the shared authentication middleware.
> See the API reference for usage.

Wiki (institutional):
> **ADR-007: Selection of the authentication architecture**
> Context → alternatives → decision → consequences.

Each surface answers its question and links to the other for depth.

---

## When to enable a Wiki

Enable the Wiki on a repo when it has genuine institutional knowledge that
does not belong in the Astro docs or the README.

Good signal: the repo is accumulating ADRs, design specs, operational
runbooks, or architectural history that contributors need to understand but
that would clutter the user-facing docs.

No signal: template repos, simple utility packages, or repos where all
relevant knowledge fits cleanly in the README and Astro docs.

Leaving a Wiki empty is completely reasonable. Enabling it just because
GitHub provides the feature and then leaving it empty — or letting it fill
with content that should be elsewhere — is worse than not enabling it.

---

## Implementation

The documentation hierarchy and Wiki structure described here informs the
following in-flight work:

**theholocron/.github-private#65** — org-standard adoption of the AI
engineering workflow. That issue's scope includes setting up the Wiki
structure (`ADRs/`, `Specs/`, `Architecture/`, `Operations/`, `Development/`)
as defined in §Canonical Wiki structure above.

**theholocron/holocron#440** — ADR format decision. This spec recommends
the Wiki as the home for accepted ADRs based on the repo-vs-Wiki rule in
§ADRs. Format (MADR vs Nygard vs other) remains open in that issue.

**theholocron/holocron/.notes/ai-engineering-workflow.spec.md** — the
"Where documentation lives" section of that spec is the condensed version
of what is defined here. This spec is the authoritative, detailed version.

---

## Open questions

1. **Wiki access** — GitHub Wiki access is controlled separately from repo
   access. For private repos, the Wiki is private by default. Confirm the
   org's Wiki visibility setting matches the intended audience (org members
   only vs. public) before publishing ADRs and specs there.
2. **Wiki initialization** — GitHub Wiki requires at least one page to be
   created via the web UI before it can be pushed to via `git`. Bootstrapping
   the structure should be documented as a one-time manual step in the
   org onboarding process.
3. **Cross-repo Wiki** — Does each repo get its own Wiki, or is there one
   org-level Wiki? The structure in §Canonical Wiki structure assumes per-repo.
   For org-wide ADRs and cross-cutting specs, a dedicated `theholocron/.github`
   or `theholocron/.github-private` Wiki may be more appropriate.
