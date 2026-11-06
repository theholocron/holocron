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
  - theholocron/holocron#1535
discussion:
  url: https://discord.com/channels/1303969001822486568/1567936155641450611
---

# A #prs forum: one thread per pull request

## Problem

There is no official GitHub app for Discord like the one Slack has. GitHub can post to a Discord webhook in its own format (the webhook URL with `/github` on the end), but that is an event stream in one channel: it says a pull request was opened, reviewed or merged, interleaved with every other pull request, and a reader has to reconstruct which ones are still waiting and why one failed. What we want is, for each pull request, one place that says it opened, says when its CI finished, whether that passed and, if not, what failed, and that still tells us at a glance what is open.

## Design

Sentinel keeps one **forum post (a thread) per open pull request** in `#prs`, a forum channel like `#ideas` (#1535). It is the right owner because it is already a GitHub App that receives `pull_request` deliveries, already reads the notifications layout (role sync, #1595) and already holds the Discord bot token.

A thread holds two kinds of content, because they answer different questions:

- **The first message is the summary** and is edited in place: the pull request's _current state_. Late, repeated or out of order deliveries give the same message.
- **The messages after it are the history** and are only appended: the pull request opened, CI finished and passed, CI finished and failed and what failed. Each is a fact about a moment, so it is posted once and never rewritten.
- **The post's tag is the state** (below), so the forum list shows at a glance what is waiting, failing or ready, and the thread says why.

### The summary (first message)

Rendered from the pull request's current state, never from the event that arrived:

- title, repository and number as a link, author, age;
- state: draft, changes requested, waiting on review (with who was asked), approved, ready to merge;
- the `ci / Required checks` result for the head commit (the one required check, so one value instead of thirty);
- whether it conflicts with its base.

The post is titled `repo#123 title`, and its first message ends with the small-print footer the discussion posts use (`-# sync: owner/repo#123`), which is how the post is found again. The renderer is a pure function over a plain state object (`renderPullRequest(state)`) that returns the summary text and the tag; fetching the state and talking to Discord are separate, so the rules are tested without either.

### The tag (state at a glance)

One tag per post, set only by the bot (`moderated`), the first that applies:

| Tag                 | Meaning                                           |
| ------------------- | ------------------------------------------------- |
| `draft`             | a draft pull request                              |
| `conflicts`         | cannot merge into its base                        |
| `failing`           | `ci / Required checks` failed                     |
| `changes requested` | a reviewer asked for changes                      |
| `ready`             | approved and `ci / Required checks` passed        |
| `waiting`           | open, waiting on review or on CI                  |
| `merged` / `closed` | finished (the post is archived and locked, below) |

### The thread (what is posted, and when)

| Event                                                                                                                 | Result                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pull_request` `opened`, `reopened`, `ready_for_review`                                                               | make the post (or reopen it) with the summary, and say it opened (author, base branch, diff size) |
| `pull_request` `synchronize`, `edited`, `converted_to_draft`, `review_requested`, `review_request_removed`, `labeled` | re-render: edit the summary and set the tag. No new message                                       |
| `pull_request_review` `submitted`, `dismissed`                                                                        | re-render: edit the summary and set the tag. No new message                                       |
| `check_run` `completed` whose name is `ci / Required checks`                                                          | edit the summary, set the tag, and **post one message: CI passed, or CI failed and what failed**  |
| `pull_request` `closed` (merged or not)                                                                               | post a last line (merged by, or closed), set `merged` / `closed`, archive and lock the post       |

The check run is filtered by name before anything is fetched, because a push produces dozens of check runs and only one of them is the verdict.

**The CI message.** One message per head commit and verdict, so a re-run that gives a new answer is a new line and a redelivery is not:

- passed: `✅ CI passed on abc1234` with a link to the run;
- failed: `❌ CI failed on abc1234`, then **what failed**: the names of the checks that did not succeed (`failure`, `timed_out`, `cancelled`), each with a link, five at most with `and N more` after (the cut the failed-run post in `platform.notifications.yml` uses, #1614). They come from the Checks API for the head commit, since the aggregate only says that something failed. The message also links the aggregate's own summary, which lists every expected check, failures first.

Each CI message ends with `-# ci: <sha> <conclusion>`. Before posting, the handler reads the thread's recent messages for that line and skips the post if it is there. That is the idempotency: GitHub's redelivery (below) cannot double-post.

**A closed pull request** is not deleted. Its post is tagged `merged` or `closed`, then archived and locked, the way a finished spec's post is, so it leaves the active list (which is what remains to be handled) and its history stays searchable. A reopened pull request unarchives and unlocks the same post; it is found by its footer among the archived posts too.

### Where the post is found

A post must be found again to be edited. The footer `-# sync: owner/repo#123` on its first message is searched for the way `ensureDiscussion` does it: the forum's active posts, then its archived ones. No new state, and the bot token is already in Sentinel. A race between two deliveries for a new pull request can make two posts, so after making one the handler lists again, keeps the oldest for that pull request and deletes the rest (the repair `setup` uses for duplicate pins).

### Automation

- **Layout.** A forum channel in the notifications layout opts in with a feed, as the errors channel does: `{ name: "prs", kind: "forum", tags: [...], feeds: { prs: true } }`. `notifications setup` creates the forum with the tags above, and `doctor notifications` checks that it exists, that the tags are all there, that the bot can post and manage threads there, and which repositories the feed covers. Today `forumLayoutProblem` refuses `feeds` on a forum because the existing feeds are webhook-driven; `feeds.prs` is bot-driven and is the one allowed.
- **Discord capability.** The post side generalizes what `ensureDiscussion` / `readDiscussion` / `updateDiscussion` do for documents: find by footer, make with a tag, retag, archive and lock. Two things are new: appending a message to a post (a new optional `Notifications.postDiscussionMessage`, which unarchives a post that archived itself) and reading a post's recent messages for the idempotency line. Both are optional methods, so a provider without threads is skipped.
- **Sentinel.** Reads the layout from the same repository as role sync and posts through the bot token, so the feed is off unless those are set, with a quiet `skipped` when they are not. No new secret. The opening of a post is quiet (no notification); a CI failure is posted normally, so people following the thread are told.
- **Scope.** Every repository the App is installed on, minus archived ones; the layout can list repositories or authors to leave out (`exclude`). Dependabot's pull requests are included, marked as such, since they are among the things that need handling.
- **The GitHub App.** Needs two more event subscriptions, `pull_request_review` and `check_run`. Permissions already cover them (Pull requests and Checks, which also reads the check runs for the failing list). The subscriptions are set by hand today, so the Sentinel README tables and the App manifest are updated in the same change.

### Failure

A feed error never changes what Sentinel's other actions do. The delivery answers 500 with the reason and logs an error line, so GitHub offers redelivery, which is safe because every step is an edit, a repair or an idempotent post.

## Alternatives not taken

- **One edited message per pull request in a text channel** (this spec's first draft). It is the best at-a-glance list (a channel that holds only open pull requests, nothing to click into) and needs no thread machinery. It gives up the history, though: the message shows only the latest state, so "CI failed, then someone pushed, then it passed" is gone, and there is nowhere to say what failed or to talk about the pull request. The forum recovers the list through its tags and the active/archived split (a forum list can be sorted by activity and filtered by tag), and the history comes free. This is a close call and the main thing to confirm (see open questions).
- **GitHub's `/github` webhook to the channel.** Minutes to set up, no code, but it is the event stream described above and cannot show what is still open.
- **A Comlink source for GitHub.** Comlink carries signed webhooks one-to-one into messages. It holds no state, so it cannot edit a summary, retag or archive a post, and Sentinel already receives these events.
- **A workflow per repository.** Every repository would need the workflow (the Notifications template, #1579, is still waiting on #1478) and a webhook secret, and a workflow still has no memory of its earlier post.

## Out of scope for v1

- Mentioning the reviewer in Discord. It needs the GitHub-to-Discord links file in `.github-private` that role sync reads, and should reuse it.
- A pinned digest ("3 need review, 1 failing") above the posts.
- Per-repository channels or forums.
- A message for each push or each review. Both edit the summary and the tag only; if that turns out too quiet, a line per review is the first addition.

## Open questions

- Forum or text channel? (Leaning forum: the history and the failing-checks list want a thread, and tags keep the list. Confirm before building.)
- Archive a closed pull request's post, or delete it? (Leaning archive, so the history stays.)
- Show drafts at all? (Leaning yes, tagged `draft`, so stalled drafts are visible.)
- Post a "CI running" line when a push starts a new run, or only the verdict? (Leaning only the verdict: a line per push is the noise a thread is meant to avoid.)
- What age counts as stale, and should it change the tag?
- Discord rate-limits making threads. Fine at this scale, but the first run on a repository with many open pull requests should make the posts over time, not in one burst.

## Dependencies and order

Sentinel in production is down (#1100), so the feed cannot run there yet. The development instance (#1678) can prove it against a test forum first, with the second GitHub App's subscriptions updated to match. Phases, each its own pull request: the renderer (summary and tag) and its tests; the Discord side (find by footer, make, retag, append, archive, repair duplicates, the idempotency read) with a stubbed client; the Sentinel action and event wiring, including the CI message and the failing-checks list; the layout feed, `setup` and `doctor`; the README and App-settings documentation.
