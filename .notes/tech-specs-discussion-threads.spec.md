---
id: SPEC-0063
status: proposed
issue: theholocron/holocron#1535
blocked-by: []
related:
  - theholocron/holocron#1160
  - theholocron/holocron#1264
  - theholocron/holocron#1318
  - theholocron/holocron#1534
  - theholocron/holocron#1102
  - theholocron/holocron#929
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618607914582016
---

# ADRs and specs: a Discord forum post for each, kept in step by a batch job

## Problem

ADRs and specs link to a GitHub Discussion for conversation (`discussion.github` in the ADR template, which 20 files carry). The conversation now happens in Discord, and a spec's status lives only in its front matter, where no one in the server can see it. #1534 posts to #ideas when a spec pull request opens or merges, but a post in a text channel is a one-off: it has no thread of its own, does not show the status, and cannot be found again.

## Decision

**Sync, not point and not mirror** (the issue's options). Each ADR and spec gets one **forum post** in `#ideas`, made from the repo file; the file stays the source of truth and the post is where people talk. The post carries the status as a **forum tag with an emoji**. A gatekeeper who changes the tag is asking for a status change, and that reaches the file as a pull request.

The whole thing is one **idempotent batch job**, `holocron specs sync`, that talks to the chat service only through a small provider interface. Backfilling the existing 17 ADRs and 36 specs is the job's first run, and switching from Discord to Slack is a new provider plus one run, not a rewrite.

## Design

### `#ideas` is a forum

`#ideas` has no history, so it is recreated as a forum channel rather than kept as text. The layout says so (`kind: "forum"` with the tags below), `notifications setup` creates it, and the forum's guidelines say what a post is. Discord cannot turn a text channel into a forum, and `setup` never deletes: if `#ideas` exists as a text channel, `setup` stops and says to delete it first (a one-time step for the maintainer), then recreates it.

A forum rejects a plain webhook post, so the "Specs to ideas" workflow (#1537) can no longer post to `#ideas` through the webhook. It is replaced as described under _Triggers_; the `ideas` webhook and its secret go unused (`setup` leaves them; delete by hand).

### One post per file

| Part          | Content                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title         | `💡 New spec: <title>` for a spec, `📐 New ADR: <title>` for an ADR, in plain text (a title cannot be formatted): the title being the first heading (`specTitle`), at most 100 characters                                    |
| Tag           | the file's `status`, with its emoji (below)                                                                                                                                                                                  |
| First message | the document's id (`SPEC-0007`, `ADR-0009`), a short description, and the pull request that added it (`PR: [#1538](url)`), a paragraph each, then a last line of small print with the file's path and the status last synced |
| Notifications | suppressed on the backfill, so 53 new posts ping no one                                                                                                                                                                      |

The title says what the post is in the forum list without opening it, and the id in the first message is what people say when they refer to a document. The description is the first paragraph under `Problem`, `Why` or `Context`, else the first paragraph, cut at 1000 characters (`specSummary`, a pure rule). The pull request is the one named by the subject of the commit that first added the file (`(#1538)`, which a squash merge puts there); a file added in a bulk commit (an import, a move) names that commit's pull request, and a file whose history names none has no `PR:` line. Edits to the file's body are not mirrored: the post links to the pull request, which is what the issue's third option ("mirror full text") was rejected for.

### Numbering

ADRs have always carried an id (`ADR-0009`, matching the number in the file name). Specs now do too: `id: SPEC-0007` in the front matter, four digits or more, unique. File names do not change, so no link breaks.

`holocron specs sync` numbers a spec that has no id, so authors never pick a number and two pull requests can never take the same one: it gives the spec without an id the next numbers after the highest in use, oldest first (by when the file was first committed, then by path), and writes the id as the first line of the front matter, in the same pull request as the `discussion.url` it writes. The 63 specs that existed were numbered in that order in one change. `specs check` warns on a spec with no id, errors on one that is not `SPEC-` and digits, and errors on two specs with the same id.

### Status as a tag

| Status       | Tag | Meaning in the server              |
| ------------ | --- | ---------------------------------- |
| `draft`      | ✏️  | being written                      |
| `proposed`   | 💬  | **in discussion**                  |
| `accepted`   | ✅  | decided                            |
| `rejected`   | ❌  | an ADR that was turned down        |
| `deprecated` | 🗑️  | an ADR no longer followed          |
| `archived`   | 📦  | a spec that shipped or was dropped |
| `superseded` | ♻️  | replaced by another                |

The union of the ADR and spec statuses (`ADR_STATUSES` and `SPEC_STATUSES` in astromech) is seven tags, under Discord's limit of 20. A new status is a new line in one table and a tag; the layout creates the tags.

A document with a **finished** status (`archived`, `superseded`, `rejected`, `deprecated`) has its post **closed**: archived and locked, so it leaves the active list and only gatekeepers can reply to it or reopen it, and a discussion that has ended does not start up again. `draft`, `proposed` and `accepted` stay open, since an accepted document is still asked about. The post follows the status its tag shows, so a gatekeeper's retag to a finished status closes it at once, before the file's pull request merges, and a retag back reopens it. Discord has no server-side mute for a thread (muting is each member's own setting), so there is nothing to add there.

### Who can change a status

The bot owns every post, so only the bot and people with **Manage Threads** can change a post's tags. The layout gives that permission to the gatekeepers role and no one else. That is the whole access rule: nothing in the job checks who retagged, because Discord already refused anyone else.

### Reconciling: three values, not two

For each file the job holds three values: the status in the **file**, the status on the **tag**, and the status **last synced**, written on the last line of the first message. Comparing only the file and the tag cannot tell "someone retagged" from "the file changed and the tag has not caught up".

| File vs last | Tag vs last | Meaning                        | Action                                           |
| ------------ | ----------- | ------------------------------ | ------------------------------------------------ |
| same         | same        | in step                        | nothing                                          |
| changed      | same        | the repo moved (a merged edit) | set the tag and the last-synced line to the file |
| same         | changed     | a gatekeeper retagged          | open or update the sync pull request (below)     |
| changed      | changed     | both moved                     | report a conflict; change nothing                |

A retag therefore never edits the file directly. It goes into **one pull request** the job keeps open on a branch of its own (`chore/specs-sync`): the `status:` lines it was asked to change and the `discussion:` links it has just made. The maintainer merges it like any other, and on the next run the file has moved, so the tag and the last-synced line catch up. The job never pushes to `alpha`, and no one's retag can change the repo without a review.

### The link in the front matter

The post's address goes into the file as `discussion.url`, replacing `discussion.github` in the ADR and spec templates and in the check (`validate-adr` warns on an accepted ADR with neither field; it will warn on neither `discussion.url` nor `discussion.github`, so the 20 existing links keep passing until the job replaces them). The job finds a file's post by `discussion.url` when it has one, else by the path on the last line of a post's first message, so a post made while a pull request was still open is found and linked after the merge, and a lost link is repaired.

### The provider interface

Optional methods on `Notifications`, the way `ensurePinned` is, rather than a nineteenth capability: a post in a channel is part of what a notifications provider does, and Slack's `conversations.*` and `reactions.*` map onto the same calls.

- `ensureDiscussion({ key, title, body, state })`: find the post whose key is `key`, create it when none exists, and return its address and its current state. Idempotent.
- `setDiscussionState(key, state)`: show the state (Discord: the tag; Slack: a reaction or a name prefix).
- `readDiscussionState(key)`: the state a person set.

`state` is one of the status names; the provider owns how it looks. The rules (what to post, the three-way table, the title and summary) are pure functions in `@theholocron/astromech/repo-validation`, like #929: `specTitle`, `describeSpecChange` and `specAnnouncementMessage` already exist from #1537. The command only supplies files and calls the provider. The files it watches come from `ADR_DIR` and `SPEC_DIRS`, so wherever #1264 decides the ADRs live, one constant changes.

### Triggers

- **On demand:** `holocron specs sync`, with the global `--dry-run`. A real run is a write to Discord and to a branch, so it asks as a writer does. The backfill is `specs sync --dry-run`, a read of the plan, then `specs sync`.
- **On a schedule, hourly:** a retag becomes a pull request within the hour. A hand-maintained workflow runs the command with the bot token and a token that can open pull requests.
- **When a spec or ADR lands on `alpha`:** a push that changes one runs the command, so its post exists straight away. (Built: the workflow's three triggers are this, the hour and on demand.)

A rerun is safe because every step first looks for the post and the tag it would make. There is still no memory of a _message_ sent, which #1102 notes; the job posts nothing but forum posts and tags, so it has nothing to repeat.

### Slack

The command and every rule are provider-free. A Slack provider implements the three methods (a message in a channel with a reply thread, the state as a reaction) and is named in `holocron.config.ts`; the first run against it creates a thread for every file that has no `discussion.url` for that provider. `discussion.url` is a plain address, so a file can carry only the current provider's, and the change over is one sync pull request that replaces them.

## Needs

- **The Discord client** (`@theholocron/discord-client`), which has no thread or forum calls yet (#1318): create a forum channel with tags, create a post in a forum, edit a post's title and tags, list active and archived posts (Discord hides idle ones, and the job must still find them), and send a message with notifications suppressed.
- **The layout:** a channel `kind` and its `tags`, and the Manage Threads permission for the gatekeepers role.
- **A token that opens pull requests** in the scheduled workflow, as `platform.repoSync` already uses (`HOLOCRON_SYNC_TOKEN`).

## Plan

One pull request each, in order:

1. The Discord client's forum and thread calls, with tests.
2. The layout (`kind: "forum"`, tags) and `notifications setup`: create the forum, refuse a text channel of the same name, set Manage Threads.
3. The provider methods on `Notifications` and the Discord implementation; the rules `specSummary` and the three-way table.
4. `holocron specs sync`, with the sync pull request.
5. The workflow (schedule and spec pull requests), replacing #1537's webhook step; the front-matter templates and the check.
6. The backfill (a dry run, then a run, by the maintainer), then removal of the unused `ideas` webhook secret.

## Open questions

- **Onboarding.** `#ideas` is one of the onboarding default channels. Discord may not accept a forum there; `setup` will say. If it does not, `#ideas` leaves the default list.
- **A post while the pull request is still open.** Not built. The first design made a post when a spec pull request opened, replacing #1537's webhook step; the posts now appear when the file lands on `alpha`, because a post made earlier needs the command to read the files from the pull request's ref instead of the working tree, to be limited to the files that pull request changes (a stale branch would otherwise retag posts back to old statuses), and to run only for pull requests from this repository (a post carries text the author wrote). Worth doing if the wait for a merge turns out to hide specs under review.
- **A post for a spec in a pull request that never merges** (only relevant if the above is built). It stays, tagged with its pull request's last status. Probably worth a `closed` tag set by the job when the pull request closes unmerged; left out until it is wanted.
- **A retagged status the validator rejects** (an ADR retagged to a spec-only status). The job opens no pull request for it and reports it.
- **Rate limits.** 53 posts in the backfill are well inside Discord's limits; the client already waits on a 429 up to 10 seconds, and the job stops cleanly past that and continues on the next run.

## Out of scope

- Mirroring the file's text (rejected in the issue).
- Moving the ADRs (#1264). The job follows `ADR_DIR` wherever it points.
- A reaction-based status change. A forum tag needs no live connection to Discord; a reaction does, and Sentinel and the Worker do not have one.
