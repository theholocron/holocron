---
status: draft
issue:
blocked-by: []
related:
  - theholocron/holocron#440
---

# AI-assisted engineering workflow

A lightweight engineering process for using AI effectively across design,
specification, implementation, and review. Defines which artifacts are
authoritative at each stage so that AI agents have clear context and clear
limits — and humans retain architectural intent without managing every detail.

> Different artifacts answer different questions, and AI should know which
> artifacts are authoritative for which decisions.

---

## Motivation

Without this structure, a single long-running AI conversation acts simultaneously
as architect, product designer, spec writer, implementer, and reviewer. Each role
has different permissions and different expected outputs. Mixing them into one
session produces unpredictable implementations, buried architectural decisions,
and reviews where the agent evaluates its own work.

Separating the phases gives each AI session a specific role, a specific source
of authority, and a specific expected output. The result is more predictable
implementations, better architectural memory, easier reviews, and substantially
less chance that an AI agent silently makes important product or architectural
decisions during coding.

---

## Artifact hierarchy

Each artifact answers a different question. Lower-level artifacts must not
silently redefine higher-level ones — conflicts surface upward.

| Artifact            | Question                                  |
| ------------------- | ----------------------------------------- |
| Issue               | What problem needs attention?             |
| Discussion          | What should we decide?                    |
| ADR                 | What did we decide, and why?              |
| Spec                | What must the system do?                  |
| Implementation Plan | How will this repository change?          |
| PR                  | What actually changed?                    |
| Tests               | Does the implementation satisfy the spec? |

Authority flows downward:

```
ADRs
  constrain ↓
Specifications
  constrain ↓
Implementation Plans
  guide ↓
Code
  verified by ↓
Tests
```

---

## Workflow overview

```
GitHub Issue
    │
    ▼
Discovery
    │
    ▼
Design
    │
    ├── Architectural decision needed?
    │         │
    │         ├── No ───────────────┐
    │         │                     │
    │         └── Yes               │
    │              │                │
    │              ▼                │
    │      GitHub Discussion        │
    │              │                │
    │              ▼                │
    │          Accepted             │
    │              │                │
    │              ▼                │
    │           Wiki ADR            │
    │                               │
    └───────────────────────────────┘
                    │
                    ▼
               Wiki Spec
                    │
                    ▼
          Implementation Plan
                    │
                    ▼
                Code / PR
                    │
                    ▼
            Review / Verification
```

Not every feature requires every step — see §Workflow tiers.

---

## Artifact responsibilities

### GitHub Issues

**Question answered: what problem needs attention?**

Issues represent work that needs to happen. They describe the problem and
desired outcome without prescribing implementation details.

Contents:

- Problem
- Desired outcome
- Constraints
- Relevant systems / known dependencies
- Links to related discussions, ADRs, specs
- Acceptance signal

Issues are intentionally lightweight. They are not ADRs and they are not
specifications.

---

### GitHub Discussions

**Question answered: what should we decide?**

Discussions are the deliberation layer. Use them when a problem requires
meaningful technical or architectural discussion before a decision is made.

A Discussion may contain:

- Current architecture and constraints
- Candidate solutions with pros and cons
- Experiments or benchmarks
- AI-generated analysis
- Open questions
- Proposed decision

The Discussion is intentionally allowed to be messy — it captures the
reasoning process. Once a decision is accepted, the important conclusions are
distilled into an ADR. The Discussion itself is not the canonical ADR.

---

### Architecture Decision Records (ADRs)

**Question answered: what did we decide, and why?**

ADRs capture significant engineering decisions that future engineers may
reasonably ask about. They live in the **GitHub Wiki** under `ADRs/` so they
are org-visible, searchable, and decoupled from any single repo's version
history.

Create an ADR when a future engineer might reasonably ask:

> Why did we choose this approach instead of another plausible approach?

**ADR-worthy:**

- Persistence strategy (Redis vs Postgres for distributed state)
- Communication model (REST vs event-driven)
- Authentication architecture
- Multi-tenancy strategy
- Service or package boundaries
- Message broker or queue selection
- Observability architecture
- Cross-repository protocol design

**Usually not ADR-worthy:**

- Function names or minor directory placement
- Small refactors
- Local implementation details
- Naming choices without architectural impact

#### ADR lifecycle

```
Proposed → GitHub Discussion → Accepted → Wiki ADR → Deprecated / Superseded
```

Do not rewrite old ADRs when architecture changes. Create a new ADR that
supersedes the previous one and update its status field.

#### ADR template

```md
# ADR-XXX: Decision Title

**Status:** Accepted
**Date:** YYYY-MM-DD
**Discussion:** <GitHub Discussion link>

## Context

Describe the problem or architectural context that required a decision.

## Decision

State the decision clearly.

## Rationale

Explain why this option was selected.

## Alternatives Considered

### Option A

Description.

Advantages:

- ...

Disadvantages:

- ...

### Option B

Description.

Advantages:

- ...

Disadvantages:

- ...

## Consequences

Expected consequences — both benefits and costs.

## Related

- Spec: ...
- Issue: ...
- Discussion: ...
```

---

### Specifications

**Question answered: what must the system do?**

A specification defines the expected behavior of a feature, protocol, system,
or workflow. It acts as the implementation contract.

Test: could another engineer or AI agent implement this feature correctly using
only this specification, without seeing the original planning conversation? If
not, the specification needs more detail.

Specs live in the **GitHub Wiki** under `Specs/` for org-wide visibility.
Feature-scoped specs that are still being drafted may live in `.notes/` first
and graduate to the Wiki when accepted.

#### Spec template

```md
# Feature Name

## Status

Draft | Accepted | Deprecated | Superseded

## Objective

What capability are we adding?

## Background

Why does this capability exist?

## Goals

- ...

## Non-Goals

- ...

## Existing Behavior

Relevant current behavior.

## Required Behavior

New expected behavior.

## Interfaces

APIs, functions, events, tools, commands, etc.

## Data Model

Schemas, persistence, state, relationships.

## Validation Rules

Valid and invalid inputs.

## State Transitions

Allowed state changes.

## Error Handling

Expected errors and failure behavior.

## Authorization / Security

Authentication and authorization requirements.

## Observability

Logs, metrics, traces, alerts.

## Compatibility

Backward compatibility and migration requirements.

## Edge Cases

Known unusual situations.

## Testing Requirements

Expected coverage and scenarios.

## Acceptance Criteria

- [ ] ...

## Related ADRs

- ADR-XXX

## Related Issues

- #123
```

---

### Implementation Plans

**Question answered: how will this repository change?**

An implementation plan translates an accepted specification into a concrete,
ordered list of repository changes. It is produced by an Implementation Planner
role (see §AI roles) after the spec is accepted.

Contents:

- Packages and files affected
- New files required
- Schema or migration changes
- API or configuration changes
- Test plan per step
- Tasks that can be parallelized
- Dependencies between steps

The planner is not an architect. It does not redesign the feature. If repository
reality conflicts with the spec, it stops and surfaces the conflict rather than
silently working around it.

---

## Where documentation lives

### Repository

Use repository documentation for information that must evolve alongside a
specific version of the code — and where a code change should normally require
a documentation change in the same PR.

Examples:

- Public API and SDK documentation
- Integration instructions
- Runtime configuration
- Deployment instructions
- Generated API references

### GitHub Wiki

Use the Wiki as the engineering knowledge base for information that spans
repositories or represents organizational knowledge.

Suggested Wiki structure:

```
Architecture/
    System Overview
    Authentication
    Observability

ADRs/
    ADR-001 ...
    ADR-002 ...

Specs/
    Interactive CLI Menu
    AI Engineering Workflow
    ...

Engineering/
    Development Workflow
    Release Process
    AI Engineering Workflow
    Token Matrix
```

The Wiki is particularly useful for:

- Accepted ADRs
- Internal specifications
- System architecture
- Engineering conventions
- Cross-repository contracts
- Internal workflows and runbooks
- Ownership information

### `.notes/` (this repo)

Working drafts — specs and research in progress that have not yet been accepted
or published to the Wiki. Files here are version-controlled but considered
pre-canonical. Graduate accepted specs to the Wiki; archive superseded ones.

---

## AI roles

Each phase of the workflow maps to a distinct AI role. The role defines what
the agent is allowed to do, what it should produce, and which artifacts it
treats as authoritative.

```
Discovery Agent   → understands the problem
Design Agent      → explores solutions
ADR Author        → records accepted decisions
Spec Author       → defines required behavior
Implementation Planner → translates spec to repo changes
Implementation Agent   → writes code
Review Agent      → verifies implementation against spec
Verification Agent → confirms acceptance criteria
```

---

### Discovery Agent

Investigates the problem before proposing a solution. Should not immediately
start writing code.

Produces:

1. Problem summary
2. Current system behavior
3. Relevant architecture
4. Constraints
5. Systems / packages likely affected
6. Unknowns and open questions
7. Risks
8. Decisions that may require architectural discussion
9. Recommended next step

If a meaningful architectural choice exists, it explicitly identifies it rather
than silently making the decision.

**Prompt:**

```
You are performing engineering discovery.

Your goal is to understand the problem and the existing system before
proposing implementation changes.

Read the relevant issue, repository code, documentation, specifications,
and ADRs.

Investigate:
- current behavior
- relevant architecture
- dependencies
- constraints
- existing patterns
- affected packages/services
- compatibility concerns
- security concerns
- operational concerns

Do not implement anything.
Do not assume the proposed solution is correct.

Produce:
1. Problem summary
2. Current system behavior
3. Relevant architecture
4. Constraints
5. Systems/packages likely affected
6. Unknowns or open questions
7. Risks
8. Decisions that may require architectural discussion
9. Recommended next step

If you discover a meaningful architectural choice, explicitly identify it
rather than silently making the decision.
```

---

### Design Agent

Explores solutions and compares plausible alternatives. Does not write
implementation code.

Produces:

- Recommended design
- Open questions
- Decisions requiring ADRs
- Decisions that are implementation details and do not require ADRs
- Suggested specification scope

**Prompt:**

```
You are acting as a software architect.

Using the issue, discovery findings, existing architecture, specifications,
and ADRs, propose a design for this change.

Do not write implementation code.

Identify the important engineering decisions required.

For each meaningful decision:
1. Explain the decision that must be made.
2. Describe viable alternatives.
3. Explain advantages and disadvantages.
4. Identify operational and maintenance consequences.
5. Recommend an approach and explain why.

Treat existing accepted ADRs as architectural constraints.
Do not contradict an accepted ADR without explicitly identifying the conflict.

At the end, produce:
- Recommended design
- Open questions
- Decisions requiring ADRs
- Decisions that are implementation details and do not require ADRs
- Suggested specification scope

Do not create ADRs merely because a choice exists. An ADR is warranted only
when the decision is significant enough that a future engineer may reasonably
ask why one approach was selected over another.
```

---

### GitHub Discussion / RFC

When architectural discussion is warranted, the design analysis becomes a
Discussion that invites engineering review rather than pretending the decision
is already final.

**Prompt:**

```
Convert the design analysis into a GitHub Discussion suitable for engineering
review.

Include:

# Problem
# Context
# Constraints

# Options
For each option:
- description
- advantages
- disadvantages
- operational consequences
- implementation complexity

# Recommended Direction
State the recommendation clearly as a proposal, not a decision.

# Open Questions
# Decision Requested

Avoid implementation-level details unless they materially affect the
architectural choice.
```

---

### ADR Author

Once a Discussion reaches an accepted decision, distills the conclusion into an
ADR. Summarizes rather than reproduces the entire debate.

**Prompt:**

```
Create an Architecture Decision Record from the accepted engineering decision.

Use the accepted GitHub Discussion as the primary source of decision history.

Capture the final architectural conclusion, not the full discussion.

Include:
- Title
- Status
- Date
- Context
- Decision
- Rationale
- Alternatives considered
- Consequences
- Related issue, Discussion, and specifications

Clearly distinguish between the final decision, supporting rationale, and
alternatives that were rejected.

Do not introduce new architectural decisions.

If the Discussion does not contain enough information to state a decision
confidently, identify the missing information instead of inventing it.
```

---

### Specification Agent

Once the design direction is established, produces the specification in a
separate session. The design process explores possibilities; the specification
describes agreed behavior.

**Prompt:**

```
You are acting as a technical specification author.

Create a specification for the requested capability using:
- the GitHub issue
- accepted design decisions
- accepted ADRs
- existing system behavior
- relevant repository documentation

Treat accepted ADRs as architectural constraints.

The specification should describe WHAT the system must do, not how to implement it.

Include:
- Objective
- Background
- Goals / Non-goals
- Existing behavior
- Required behavior
- Interfaces
- Data model
- Validation
- State transitions
- Error handling
- Authorization / security
- Observability
- Compatibility requirements
- Edge cases
- Testing requirements
- Acceptance criteria
- Related ADRs and issues

The specification should be detailed enough that another engineer or AI agent
could implement the feature without seeing the original planning conversation.

IMPORTANT: Do not silently make new architectural decisions. If the specification
requires a decision that has not been established, mark it as an unresolved
design question and surface it for discussion.
```

---

### Implementation Planner

Translates the accepted specification into repository changes. Not an architect —
does not redesign the feature.

**Prompt:**

```
You are acting as an implementation planner.

Treat the accepted specification and ADRs as authoritative.

Inspect the repository and produce a concrete implementation plan for
satisfying the specification. Do not redesign the feature.

Identify:
- packages/services affected
- files likely affected
- new files required
- schema changes and migrations
- API changes
- configuration changes
- tests required
- observability changes
- documentation changes
- deployment or rollout requirements

Produce an ordered implementation plan. Each step should include:
1. Goal
2. Files or modules affected
3. Expected change
4. Tests required
5. Dependencies on earlier steps

Identify tasks that can safely be implemented in parallel.

If repository reality conflicts with the specification or ADRs, stop that
portion of the plan and explicitly describe the conflict. Do not silently
alter the design to work around it.
```

---

### Implementation Agent

Writes the code. Architectural creativity is intentionally limited at this stage.

Authority order:

1. Accepted ADRs
2. Accepted specification
3. Approved implementation plan
4. Existing repository conventions

**Prompt:**

```
You are implementing an accepted engineering specification.

Authority order:
1. Accepted ADRs
2. Accepted specification
3. Approved implementation plan
4. Existing repository conventions

Implement the approved plan.

Do not change product behavior described by the specification.
Do not contradict accepted ADRs.
Do not introduce new architectural patterns unless required by the specification.
Follow existing repository conventions where they do not conflict with the spec.

For each implementation step:
- make the required change
- add or update tests
- preserve backward compatibility where required
- add appropriate observability
- update relevant documentation

If you discover that repository reality makes the specification impossible or
requires a new architectural decision:

STOP that portion of implementation.

Describe:
- what the specification requires
- what the repository currently supports
- why they conflict
- what decision is required

Do not silently invent a new design.
```

---

### Review Agent

Reviews in a separate context — does not evaluate its own implementation.
Compares the implementation against the original requirements, not just code
quality.

**Prompt:**

```
You are acting as an independent engineering reviewer.

Review the implementation against:
1. The GitHub issue
2. Accepted ADRs
3. The accepted specification
4. The implementation plan
5. Repository conventions

Do not assume the implementation is correct simply because tests pass.

Evaluate:

## Specification Compliance
Identify every requirement in the specification and determine whether it is
implemented.

## ADR Compliance
Identify any behavior or architecture that conflicts with accepted ADRs.

## Correctness
Look for logical errors, invalid state transitions, race conditions, missing
validation, and incorrect assumptions.

## Security
Review authentication, authorization, data exposure, input handling, and
trust boundaries.

## Failure Behavior
Review errors, retries, partial failures, rollback behavior, and recovery.

## Observability
Confirm appropriate logs, metrics, traces, and diagnostic information.

## Compatibility
Check backward compatibility and migration behavior.

## Testing
Identify missing test cases — especially failure paths, boundary conditions,
authorization, state transitions, concurrency, and regression cases.

## Scope
Identify unrelated changes or unnecessary complexity.

Produce findings ordered by severity. For each finding include:
- severity
- location
- violated requirement or principle
- explanation
- recommended correction

Finally provide:
- specification requirements fully satisfied
- specification requirements partially satisfied
- specification requirements missing
- ADR violations
- overall recommendation
```

---

### Verification Agent

A final pass confirming the implementation satisfies the contract.

**Prompt:**

```
Verify this implementation against the accepted specification.

Treat each acceptance criterion as independently testable.

Create a requirement matrix containing:
- requirement
- implementation location
- test coverage
- status (PASS | PARTIAL | FAIL | NOT TESTED)
- notes

Do not infer compliance merely because related code exists.
Verify the actual behavior where possible.
Identify any specification language that is ambiguous or impossible to verify.
```

---

## Handling new decisions during implementation

Implementation occasionally reveals information that was unknown during design.
This is expected. What should not happen is for the implementation agent to
quietly make a significant design decision.

```
Implementation
    │
    ▼
Unexpected architectural issue
    │
    ▼
Return to design
    │
    ├── GitHub Discussion if needed
    ▼
New or amended ADR
    │
    ▼
Update specification
    │
    ▼
Update implementation plan
    │
    ▼
Resume implementation
```

**The governing rule:** lower-level artifacts must not silently redefine
higher-level artifacts.

---

## Prompt directory

For repositories using AI heavily, reusable prompts live alongside engineering
documentation so any agent or developer can invoke them consistently.

Managed by `holocron setup` — see issue theholocron/holocron#438 for the
proposed `.agents/prompts/` provisioning work.

Intended structure:

```
.agents/
    prompts/
        discovery.md
        design.md
        discussion.md
        adr.md
        spec.md
        implementation-plan.md
        implement.md
        review.md
        verify.md
```

Prompts describe the role and authority of the agent rather than a bare task
instruction. Compare:

```
# Less useful
Plan how to add rate limiting.

# Better
Act as a design agent. Investigate the existing system and identify viable
designs for distributed rate limiting. Do not implement anything. Treat
accepted ADRs as constraints. Identify architectural choices that require
human review. Produce alternatives, tradeoffs, and a recommended direction.
```

---

## Workflow commands

Prompt invocations can be wrapped as slash commands or CLI tasks. Exact tooling
is secondary — the role boundaries matter more than the invocation mechanism.

Proposed command set (to be implemented as Claude Code skills):

```
/discover <issue>    → Discovery Agent
/design   <issue>    → Design Agent
/discuss  <design>   → GitHub Discussion draft
/adr      <decision> → ADR Author
/spec     <issue>    → Specification Agent
/plan     <spec>     → Implementation Planner
/implement <plan>    → Implementation Agent
/review   <pr>       → Review Agent
/verify   <spec>     → Verification Agent
```

See theholocron/skills for implementation.

---

## Workflow tiers

### Lightweight — small changes

```
Issue → Implementation Plan → Code → PR
```

Examples: bug fixes, dependency updates, simple UI changes, minor refactors,
documentation fixes.

---

### Medium — behavior changes with meaningful requirements

```
Issue → Discovery → Spec → Implementation Plan → Code → Review
```

No ADR unless an architectural decision exists.

---

### Full architectural — major system changes

```
Issue → Discovery → Design → GitHub Discussion → ADR → Spec
     → Implementation Plan → Implementation → Review → Verification
```

Examples: new services, new persistence systems, authentication architecture,
significant API redesign, cross-repository protocols, infrastructure changes.

---

## Avoiding process theater

The workflow provides clarity, not bureaucracy. Do not require an ADR simply
because the workflow contains an ADR stage.

Ask: is there an architectural decision here that future engineers will care
about? If not, skip the ADR.

The amount of documentation should scale with:

- Risk and complexity
- Number of teams or repos affected
- Architectural impact
- Expected lifespan of the decision
- Ambiguity in the problem
- Cost of getting the behavior wrong

---

## Core principles

**Separate exploration from commitment.** Design discussions explore
possibilities. ADRs and specs record decisions.

**Separate architecture from behavior.** ADRs describe architectural
decisions. Specs describe required system behavior.

**Separate behavior from implementation.** Specs define what must happen.
Implementation plans define how this repository achieves it.

**Make AI surface uncertainty.** AI should not silently invent requirements or
architecture. Unresolved decisions should be explicitly surfaced.

**Preserve decision history.** GitHub Discussions preserve the debate. ADRs
preserve the conclusion.

**Use specifications as contracts.** The implementation is judged against the
specification, not against the AI conversation that generated it.

**Use independent review.** Use a separate AI context for review — do not ask
the implementing agent whether its own implementation is correct.

---

## Implementation

### theholocron/holocron

- `feat(setup): provision .agents/prompts/ with role-based AI workflow prompt
files` — `holocron setup` writes one prompt file per agent role into
  `.agents/prompts/`. Files are gitignored by default but can be committed per
  repo preference.

### theholocron/skills

- `feat(skills): add AI engineering workflow slash commands` — implement
  `/discover`, `/design`, `/discuss`, `/adr`, `/spec`, `/plan`, `/review`,
  `/verify` as Claude Code skills backed by the prompt files above.

### GitHub Wiki (theholocron org)

- Publish accepted ADRs under `ADRs/`
- Publish accepted specs under `Specs/`
- Publish this workflow under `Engineering/AI Engineering Workflow`
- Related: theholocron/holocron#440 (ADR format decision — still open)

---

## Open questions

1. **ADR home: Wiki vs `.notes/`** — this spec recommends the Wiki for accepted
   ADRs and specs; theholocron/holocron#440 is still exploring format options.
   Decision deferred until that issue resolves.
2. **Prompt file gitignore policy** — should `.agents/prompts/` be committed per
   repo or gitignored and regenerated by `holocron setup` on demand? Committing
   enables per-repo customization; gitignoring keeps the canonical version in
   the CLI.
3. **Skill command discoverability** — should `/discover <issue>` fetch the issue
   body automatically via `gh issue view`, or require the user to paste it in?
   Fetching is more ergonomic; pasting gives the user control over what context
   the agent sees.
