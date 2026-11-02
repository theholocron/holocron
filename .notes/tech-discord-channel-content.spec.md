---
id: SPEC-0061
status: proposed
issue: theholocron/holocron#1533
blocked-by: []
related:
  - theholocron/holocron#1160
  - theholocron/holocron#1102
  - theholocron/holocron#1135
  - theholocron/holocron#1139
  - theholocron/holocron#1534
---

# Discord: channel content from files in the repository

## Problem

The Discord server is built as code (#1134), but what some channels say is still typed by hand: `#rules` and the START HERE channels. #errors and #uptime fill themselves; a pinned message is only text inside `holocron.config.ts`, where a rules change is a config change, hard to review as prose and not readable by anyone who is not in the config.

## Design

### The layout field

A pinned message gets one more way to say its text. `pinned` already declares `{ channel, content }`; it now also takes `{ channel, file }`, where `file` is a path relative to the repository root. The two are exclusive. `RULES.md` at the root is the first file and feeds `#rules`. Any channel in the layout can name a file, so nothing else needs a new mechanism.

This reuses the pinned-message machinery of #1135 to #1139 as it is: post, pin, keep the oldest copy, remove strays, replace a pin that says something else, report a pin that differs. The only new step comes before the provider is called.

### Where the file is read

In the CLI, not in the provider. `notifications setup` and `doctor notifications` call `resolvePinnedFiles()` right after they pick the provider. It reads each `file` and hands the provider a layout in which that message's `content` is the file's text; the `file` name stays on the message so an error or a drift report can name it. A provider therefore never touches the file system, and any provider that supports `pinned` gets the feature.

- In `setup` an unreadable file stops the run before anything is created, like an unreadable avatar does.
- In `doctor` an unreadable file fails the `pinned` row only; every other row is still checked.

The text is normalised so that an editor's habits never show up as drift: a byte-order mark is dropped, line endings become `\n` and blank lines at the end are trimmed.

### Overwrite policy

The repository wins. A pin that was edited by hand in Discord, or that no longer matches the file, is replaced on the next `setup` (a new message is pinned first and the old one removed after, as today). `doctor notifications` reports it first: `#rules: the pinned messages differ from RULES.md`. This is what the layout already means ("the layout is the whole set of messages the bot has pinned in a channel"); a file does not change it.

### Limits

- **2000 characters.** Discord's limit for one message, counted after `#channel` names are linked (a link is longer than the name). A longer message is **refused, not split**: where a split falls (mid-list, mid-sentence) is an editorial choice, and splitting would make one file own several pins whose order and identity the drift check would have to track. Two messages in one channel are two entries, each with its own file. The refusal names the file and the length, and happens before anything changes.
- **100 KB.** A file over it is refused unread; this only stops a wrong path from filling memory.
- **Inside the repository.** The path is resolved from the repository root, whatever directory the command runs in. An absolute path, a `..` that climbs out, and a link that leads outside are refused, so a config cannot make a command post a file the repository does not own. (Avatars are read from the working directory without this check; they are images and do not carry text into a channel.)

### Markdown

A file is Discord's markdown, not GitHub's. The one difference that matters here is that Discord shows a single newline as a line break and GitHub joins the lines, so `RULES.md` separates paragraphs with a blank line to read the same in both. The file must not carry content that is not meant to be posted, such as an HTML comment, since the whole file is the message.

## Decisions

- **Does a hand edit in Discord survive?** No: the repository wins, and `doctor` reports the drift until `setup` runs.
- **Split or fail past 2000?** Fail.
- **Which other channels get a file?** The mechanism is generic; only `#rules` moves now. `#welcome` stays inline until its text is worth reviewing as prose, and per-channel descriptions are topics, which the layout already sets.
- **Read in the CLI or the provider?** The CLI, so providers stay free of the file system and the feature is not Discord-specific.

## Out of scope

- Pointing ADRs and specs at a Discord thread (#1535), and posting new specs to `#ideas` (#1534). #1534 is a separate workflow and does not use this.
- Syncing a channel's messages back into a file.
