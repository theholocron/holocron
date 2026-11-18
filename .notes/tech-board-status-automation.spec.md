---
status: draft
issue: theholocron/holocron#2388
blocked-by: []
related:
  - theholocron/holocron#1744
  - theholocron/holocron#1738
  - theholocron/holocron#1100
---

# Board statuses that follow the pull request

## Problem

The v5 board has Someday, Todo, In Progress, Blocked and Done. `reconcile-projects` sets Blocked, back to Todo, and Done
from the blocked-by links and the issue's state (`planReconcile()`, spec `command-project`). Nothing sets In Progress when
work starts, nothing says "waiting on review", and an agent that starts an issue has no command to set a status without
looking up a project item id. The board drifts from the pull requests.

## Decision

### Statuses

`In Review` joins the `roadmap` template, after In Progress, in a new category `review`
(`BoardStatusCategory`: `backlog`, `planned`, `active`, `review`, `blocked`, `done`). A category of its own keeps the rules
provider-neutral: a rule asks for "the review status", not for a name. Where a category has several statuses the first in
template order is used, as today. `holocron project setup` makes the option on the live board (it sends every existing
option with its id, so nothing on the board changes meaning); the template's `Mirrors project 5` comment stays true.

### The flow

| Event                                                             | Status                                    |
| ----------------------------------------------------------------- | ----------------------------------------- |
| A pull request that closes the issue is open                      | `active` (In Progress)                    |
| That pull request's `ci / Required checks` aggregate is `success` | `review` (In Review)                      |
| The pull request is merged, or the issue closed                   | `done` (existing rule)                    |
| The issue has an open blocker                                     | `blocked` (existing rule, wins over both) |

- **A draft pull request is a pull request.** It moves the issue to `active`; draft state never blocks In Review. CI green
  decides it, and the agent or person marks the pull request ready after that. There is no Draft status.
- **Starting work** is a pull request existing, or a person or agent saying so (below). A branch alone is not read.
- **Backward moves.** A `failure` of the aggregate moves `review` back to `active`; `pending` (a re-run after a push)
  leaves the status alone, so a push does not flicker the board.
- **No pull request:** nothing changes; the status a person set stays.
- **Several linked pull requests:** the issue is `review` when any open one is green, else `active` when any is open.

### One rules function

`planPullRequestStatus(item, template)` is pure and sits beside `planReconcile()`; it reads `BoardItem.pullRequests`
(`{ key, state: "open" | "merged" | "closed", draft, checks: "success" | "failure" | "pending" | "none" }[]`, the pull
requests that close the issue) and returns the change or nothing. It never touches priority or any other field, and
applying it twice changes nothing. Blocked still wins, because `planReconcile()` runs first.

### Two places that apply it

1. **`reconcile-projects` (hourly, Actions).** The GitHub provider reads each item's closing pull requests and the aggregate
   check on the head commit (`closedByPullRequestsReferences`, the check run named `ci / Required checks`), and
   `reconcile project` applies both rules through `Projects.setStatus`. This works today and is the safety net: a missed
   webhook is repaired within the hour.
2. **Sentinel, on events.** A handler on `pull_request` (`opened`, `reopened`, `ready_for_review`, `converted_to_draft`,
   `closed`) and on the aggregate `check_run` reads the pull request and the issues it closes from the API (never the
   payload) and applies the same function at once. It needs the same env as role sync and the PR feed, is a quiet `skipped`
   when not configured, and shares no state with the hourly run. The GitHub App needs the organization projects
   permission (a human step, with the permission list in the App manifest). Sentinel production is down (#1100), so this
   fires only where an instance runs.

### Setting a status by hand

`holocron project status <issue> <status>` sets one item's status through `Projects.setStatus`, by the issue key, so an
agent never needs a project item id. It takes a status name of the board's template; `--dry-run` prints the change;
it asks nothing (a status is easy to set back). It is for the start of work, the only event the rules cannot see.

### Agent rules

A short section in `.holocron/org.md`, which `holocron sync` writes into every repo's `AGENTS.md`:

1. Starting an issue: `holocron project status <issue> "In Progress"` (the automation also does it once a pull request
   exists).
2. Open the pull request as a draft (`gh pr create --draft`), as soon as there is something to push.
3. When the aggregate check is green, mark it ready (`gh pr ready`). The board moves to In Review by itself.
4. Never set In Review, Blocked or Done by hand: the rules own them. Blocked comes from a blocked-by link, never the
   status.

## Parts (one pull request each)

1. The `review` category, the `In Review` status in the template, `planPullRequestStatus()`, and `holocron project setup`
   on the live board.
2. `BoardItem.pullRequests`, read by the GitHub provider, and the rules in `reconcile project`.
3. `holocron project status`.
4. The agent rules in `.holocron/org.md`.
5. Sentinel's handler.

## Open questions

- **Linear.** Its `projects` mapping reads a status from a team workflow state's type. A `review` category needs a name
  match (a started state called "In Review") or none; the first choice is none, and a Linear board keeps working without
  it, since a rule for a category the template lacks is listed as unresolved, not guessed.
- **A pull request in another repository** that closes the issue: read through `closedByPullRequestsReferences` as far as
  GitHub reports it; otherwise only same-repository pull requests count.
- **Sentinel's hosting** (#1100, #2203): until an instance runs for this repo, the hourly run is the only applier.
