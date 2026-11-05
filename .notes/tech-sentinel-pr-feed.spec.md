---
id: SPEC-0068
status: draft
issue: theholocron/holocron#1738
blocked-by: []
related:
  - theholocron/holocron#1595
  - theholocron/holocron#1161
  - theholocron/holocron#1160
  - theholocron/holocron#1100
  - theholocron/holocron#1678
discussion:
  url: https://discord.com/channels/1303969001822486568/1567936155641450611
---

# A #prs channel: which pull requests need handling

## Problem

There is no official GitHub app for Discord like the one Slack has. GitHub can post to a Discord webhook in its own format (the webhook URL with `/github` on the end), but that is an event stream: it says a pull request was opened, reviewed or merged, and a reader has to reconstruct which ones are still waiting. What we want to see is the state: what is open, what is stuck, what is ready.

## Design

Sentinel keeps one message per open pull request in `#prs`. It is the right owner because it is already a GitHub App that receives `pull_request` deliveries, already reads the notifications layout (role sync, #1595) and already holds the Discord bot token.

### The message

Rendered from the pull request's **current state**, never from the event that arrived, so deliveries that are late, repeated or out of order give the same message:

- title, repository and number as a link, author, age;
- state: draft, changes requested, waiting on review (with who was asked), approved, ready to merge;
- the `ci / Required checks` result for the head commit (the one required check, so one value instead of thirty);
- whether it conflicts with its base;
- the colour follows what it needs: red failing or conflicting, amber waiting on someone, green ready to merge, grey draft.

The renderer is a pure function over a plain state object (`renderPullRequest(state)`); fetching the state and talking to Discord are separate, so the rules are tested without either.

### Lifecycle

| Event                                                                                                                 | Result             |
| --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `pull_request` `opened`, `reopened`, `ready_for_review`                                                               | post the message   |
| `pull_request` `synchronize`, `edited`, `converted_to_draft`, `review_requested`, `review_request_removed`, `labeled` | re-render and edit |
| `pull_request_review` `submitted`, `dismissed`                                                                        | re-render and edit |
| `check_run` `completed` whose name is `ci / Required checks`                                                          | re-render and edit |
| `pull_request` `closed` (merged or not)                                                                               | delete the message |

The check run is filtered by name before anything is fetched, because a push produces dozens of check runs and only one of them changes the message. A closed pull request leaves the channel: GitHub already records that it merged, and the channel stays a list of what is left.

### Where the message id lives

A message must be found again to be edited. Options, in the order we would take them:

1. **Search the channel with the bot token.** Every message carries `owner/repo#number` in its embed footer; the handler lists the channel's recent messages and finds its own. No new state, and the bot token is already in Sentinel for role sync. The listing is bounded (the last few hundred messages), which is plenty for a channel that holds only open pull requests.
2. A marker comment on the pull request holding the message id. State in GitHub, but a visible comment on every pull request.
3. A key-value store. Extra infrastructure for one number.

The spec takes (1). A race between two deliveries for a new pull request can post twice, so after a post the handler lists again and keeps the oldest message for that pull request and deletes the rest (the same repair `setup` uses for duplicate pins). Everything else is an edit of an existing message, which is idempotent.

### Automation

- **Layout.** A channel in the notifications layout opts in with a feed, as the errors channel does with `feeds: { errors: true }`: `{ name: "prs", feeds: { prs: true } }`. `notifications setup` creates the channel (read-only for members, the bot can post), and `doctor notifications` checks that it exists, that the bot can post there and which repositories the feed covers.
- **Sentinel.** Reads the layout from the same repository as role sync and posts through the bot token, so the feed is off unless those are set, with a quiet `skipped` when they are not. No new secret.
- **Scope.** Every repository the App is installed on, minus archived ones; the layout can list repositories or authors to leave out (`exclude`). Dependabot's pull requests are included, marked as such, since they are among the things that need handling.
- **The GitHub App.** Needs two more event subscriptions, `pull_request_review` and `check_run`. Permissions already cover them (Pull requests and Checks). The subscriptions are set by hand today, so the Sentinel README tables and the App manifest are updated in the same change.

### Failure

A feed error never changes what Sentinel's other actions do. The delivery answers 500 with the reason and logs an error line, so GitHub offers redelivery, which is safe because every step is an edit or a repair.

## Alternatives not taken

- **GitHub's `/github` webhook to the channel.** Minutes to set up, no code, but it is the event stream described above and cannot show what is still open.
- **A Comlink source for GitHub.** Comlink carries signed webhooks one-to-one into messages. It holds no state, so it cannot edit or remove a message, and Sentinel already receives these events.
- **A workflow per repository.** Every repository would need the workflow (the Notifications template, #1579, is still waiting on #1478) and a webhook secret, and a workflow still has no memory of its earlier message.
- **A forum channel with one post per pull request.** Good for discussion, as the specs forum is, but a forum is not an at-a-glance list; the point here is the list.

## Out of scope for v1

- Mentioning the reviewer in Discord. It needs the GitHub-to-Discord links file in `.github-private` that role sync reads, and should reuse it.
- A pinned digest ("3 need review, 1 failing") above the per-pull-request messages.
- Per-repository channels.

## Open questions

- Delete a closed pull request's message, or edit it to a final line? (Leaning delete.)
- Show drafts at all? (Leaning yes, grey, so stalled drafts are visible.)
- What age counts as stale, and should it change the colour?

## Dependencies and order

Sentinel in production is down (#1100), so the feed cannot run there yet. The development instance (#1678) can prove it against a test channel first, with the second GitHub App's subscriptions updated to match. Phases, each its own pull request: the renderer and its tests; the Discord side (find, post, edit, delete, repair duplicates) with a stubbed client; the Sentinel action and event wiring; the layout feed, `setup` and `doctor`; the README and App-settings documentation.
