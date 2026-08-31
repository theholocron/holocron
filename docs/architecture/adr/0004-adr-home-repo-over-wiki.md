---
id: ADR-0004
title: "ADR home — Git repository over GitHub Wiki"
status: accepted
date: 2026-08-28
owners: []
specs:
  - .notes/docs-architecture.spec.md
  - .notes/knowledge-system.spec.md
discussion:
  github:
supersedes: []
superseded-by: []
tags: [adr, documentation, knowledge-system]
---

# ADR home — Git repository over GitHub Wiki

* Status: accepted
* Date: 2026-08-28

## Context and Problem Statement

The engineering knowledge system spec defines a canonical layout for ADRs
and other documentation. A recurring question across teams: should ADRs
live in the repository alongside code, or in the GitHub Wiki as standalone
institutional knowledge? Both have valid arguments and the choice is not
obvious.

## Decision Drivers

* ADRs must be reviewable via the PR process — discussion before acceptance
* Tooling (`npx madr`, frontmatter validation CI) targets filesystem paths
* Agent workflows read from the file system; Wiki access requires a separate API call
* Versioning alongside the code that the decision describes

## Considered Options

* **GitHub Wiki** — separate Git history, browser-friendly, editable by org members
* **Repository (`docs/architecture/adr/`)** — versioned with the code, PR-reviewed, CLI-accessible

## Decision Outcome

Chosen option: **Repository at `docs/architecture/adr/`**, because the PR
review requirement is the deciding factor: an ADR must be discussed and
accepted before it is committed, which maps naturally to the PR workflow.
The Wiki's separate Git history makes that review harder to enforce.

### Positive Consequences

* ADR creation follows the standard Issue → Spec → PR → merge workflow
* `npx madr new "title"` scaffolds directly into the correct path
* CI can validate frontmatter schema on PR (see #456)
* Agents can read ADRs from the filesystem without Wiki API access
* `git log docs/architecture/adr/` gives a decision history without extra tooling

### Negative Consequences

* ADRs are tied to the repo's default branch — consulting a specific version requires checking out a commit
* GitHub Wiki offers a nicer browsing UX than raw Markdown on GitHub.com

## Pros and Cons of the Options

### GitHub Wiki

* Good, because browser-friendly rendered view with sidebar navigation
* Good, because org members can edit without a PR (lower friction for small corrections)
* Good, because Wiki has its own searchable Git history independent of the main repo
* Bad, because no native PR review gate — enforcement requires convention, not tooling
* Bad, because `npx madr` and frontmatter CI cannot target the Wiki filesystem path
* Bad, because agent workflows require a separate API call to read Wiki pages

### Repository (`docs/architecture/adr/`)

* Good, because ADR creation follows the same PR workflow as all other changes
* Good, because frontmatter schema validation CI runs on every PR touching the directory
* Good, because agents read ADRs from the working tree with no additional API calls
* Bad, because browsing experience is raw Markdown on GitHub unless a docs site renders it
