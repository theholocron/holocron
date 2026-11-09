---
id: SPEC-0072
status: draft
issue: theholocron/holocron#1994
blocked-by: []
related:
  - theholocron/holocron#1859
discussion:
  url: https://discord.com/channels/1303969001822486568/1569247484767772792
---

# Ideas vault: an inbox in front of the issue

## Problem

The process starts at the issue (`issue -> spec -> epic -> sub-issues -> work`). Before that, an idea has no home. It
lives in a head, a chat or a scattered note, so some are lost and the rest reach the tracker half-formed. There is also
no way to hand one to an agent without first typing it into an issue.

## Decision

Add a step in front: `idea -> issue -> spec -> epic -> sub-issues -> work`.

- **The vault is an inbox.** Each repo has its own, a folder of Markdown notes opened in Obsidian: Holocron's and
  Rando's are separate vaults. It holds ideas that are not filed yet, and nothing else.
- **The issue is the record.** Filing an idea creates an issue whose body is the note. The note then leaves the vault,
  so there is never a second copy to keep in step and no rule about which side deletes.
- **The vault lives in iCloud Drive**, in Obsidian's own folder. That is what lets the iOS app capture a note, and it
  is why no git repository sits inside the vault: iCloud syncs file by file and can corrupt a `.git/` folder.
- **A note's state is a `status:` property** in its frontmatter. Specs already use `status:` and `issue:` this way, and
  Obsidian's property editor suggests the values already used in the vault, so a state is quick to set. It does not
  offer a fixed list; the plugin's **File this idea** command (part 2) does, as a picker of the configured states.
- **Automation acts on a state change made by a person**, never on a note being added. Acting on a dropped-in note is
  left for later and is not part of this spec.

## States

| `status`      | Meaning                                        | Automation                               |
| ------------- | ---------------------------------------------- | ---------------------------------------- |
| `seed`        | Dropped in; not looked at (the default)        | None                                     |
| `exploring`   | Being thought through                          | None                                     |
| `in-progress` | Worth doing; track it                          | Files an issue once and records `issue:` |
| `dropped`     | Decided against; kept so it is not re-proposed | None                                     |

The names live in the `ideas` block of `holocron.config`, so Rando can use its own words. The four above are the
defaults.

## The flow

1. **Capture, on any device.** A note is written in Obsidian and iCloud syncs it. It starts as `seed`.
2. **Think it through, on any device.** The state moves to `exploring`, or to `dropped` for a decision against.
3. **File it, on a Mac.** The **File this idea** command sets `in-progress` and runs `holocron ideas sync`, which
   creates the issue through the repo's `issues` provider (GitHub for Holocron, Linear for Rando). Only after the issue
   exists does the command move the note to the Obsidian trash. If anything before that step stops, nothing is deleted.
   A state set on the phone syncs over and is filed the next time a Mac runs the command; the note shows as queued
   until then.
4. **The normal process.** From the issue on, it is the existing flow. The idea is no longer a separate file.
5. **Spec time.** The issue text is the starting point for the spec's Problem section.

The issue body is the note's text, then a line `Filed from idea: <title>`. With no note left to write `issue:` into,
that line is how an issue is traced to its idea.

## Parts

### 1. `holocron ideas sync`

`holocron ideas sync [--dry-run] [--yes]`, a `repo-aware` command with a `COMMAND_CONTEXTS` and a `COMMAND_REGISTRY`
entry.

- Reads every note in `ideas.dir`, except those in a folder whose name starts with `_` or `.` (`_templates/` for the
  note template, and Obsidian's own `.obsidian/` and `.trash/`).
- For each note in the filing state with no `issue:`, creates an issue and writes `issue:` into the note, in the
  tracker's own syntax (`#1234`, `RANDO-7`), which `specs check` already accepts. This is what makes the step run once.
- Prints one row per note through `printCheckRows`, and a summary.
- Follows the other writers: asks first unless `--dry-run` or `--yes`, never deletes, is a no-op the second time, and a
  note it cannot file is a row, not the end of the run.
- **The CLI never deletes a note.** Without the plugin, a filed note stays in the vault with `issue:` set. Deleting from
  a command line is the riskier half, so it belongs to the plugin, which can use Obsidian's trash.
- A note with embedded attachments (an image or a file) is reported and skipped, because an issue body cannot carry
  them.

The `ideas` block:

```ts
ideas: { dir: "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/The Holocron", states: { file: "in-progress" } }
```

`dir` can also come from `HOLOCRON_IDEAS_DIR`, since the path differs per machine. A bad shape is a `ConfigError` that
names the path.

### 2. The Obsidian plugin

A small plugin with a **File this idea** command (and a button for it). It sets the state, runs `holocron ideas sync`
on desktop, and on success moves the note to the Obsidian trash (the system trash or the vault's `.trash`, whichever
the user set, so a deletion can be undone). It holds no logic of its own and no token.

- **Desktop only for the filing.** A plugin runs on iOS but has no checkout, shell or git there. On the phone the
  command only sets the state.
- **No token in the plugin.** A token in the plugin's `data.json` would be synced to every device by iCloud. The CLI
  reads tokens through its normal chain on the Mac.
- **Order matters.** Create the issue, confirm it has a number, then trash the note.

### 3. Discord, agents, Rando

Later. A note being filed can be announced through the `notifications` capability, and an agent can read the vault. Rando
adopts this when it adopts the CLI, with its own vault and its own states.

## Public or private

The note's text becomes the issue body, so an idea filed in Holocron's repo is public. That is accepted: the ideas are
low-sensitivity by choice. A repo that wants them private files them in a private repo; the command only reads
`ideas.dir` and the repo's `issues` provider.

## Open questions

1. Does the vault get its own git history, for every draft and not only what is filed? It would be a separate small
   repository committed on a schedule, with its git directory outside iCloud. It is independent of the filing flow, so it
   can be decided after part 1.
2. Where the plugin lives and how it is installed: a package in this repo, installed by hand or through BRAT, or a
   community plugin. Only part 2 depends on it.
3. Whether a `dropped` note stays in the vault, or moves to an `_archive/` folder.
4. Whether `ideas sync` stays a command run by hand, or also runs on a schedule on a Mac.
