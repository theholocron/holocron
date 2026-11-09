---
id: SPEC-0072
status: draft
issue: theholocron/holocron#1994
blocked-by: []
related:
  - theholocron/holocron#1859
  - theholocron/holocron#2022
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
- **Where ideas are kept is a provider.** Obsidian is the first, not a built-in: `holocron ideas sync` reads ideas
  through an `ideas` capability and files them through `issues`, so the notes could live somewhere else later (see
  [The `ideas` capability](#the-ideas-capability)).
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

The issue body is the note's text, then a line `Filed from idea: <title>`, then a hidden marker on its own last line,
`<!-- holocron:idea <path of the note in the vault> -->`. With no note left to write `issue:` into, the visible line is
how an issue is traced to its idea. The marker is how `ideas sync` knows a note was already filed: it looks for an issue
carrying it before it creates one, so a note whose `issue:` could not be written back is never filed twice.

## The `ideas` capability

Everything else a vendor owns in Holocron is a capability with a provider, and the notes are no different. Today
`holocron ideas sync` (#2004) reads the Obsidian vault straight from the filesystem, so the vault's conventions
(frontmatter, `![[ ]]` embeds, an iCloud path) sit in the CLI and a second place to keep ideas would mean changing the
command and its config. The fix is a capability, `ideas` (single cardinality).

The name is the noun, like `issues`, `projects` and `wiki`. "Whiteboarding" would mean a visual canvas (Miro, FigJam,
Excalidraw), which is a different capability and stays free for it; "brainstorming" names the activity, not the thing
kept.

```ts
interface Ideas {
  /** Every idea the provider holds, in a provider-neutral shape. */
  list(): Promise<IdeaRecord[]>;
  /** Moves an idea to a state. */
  setStatus(key: string, status: string): Promise<void>;
  /** Records the issue an idea was filed as, so the step runs once. */
  markFiled(key: string, issue: string): Promise<void>;
  /** Optional: takes a filed idea out of the inbox. */
  retire?(key: string): Promise<void>;
}

interface IdeaRecord {
  key: string; // opaque to the CLI (a path, for Obsidian); also what the hidden marker carries
  title: string;
  body: string;
  status: string;
  issue?: string;
  attachments: string[]; // what the provider cannot put in an issue body
}
```

- **`attachments` is the provider's call.** Obsidian embeds a file and another note with the same `![[ ]]` syntax, so
  the Obsidian provider reports both; the command only skips a record that has any.
- **`retire()` is optional and the Obsidian provider does not implement it at first.** The CLI never deletes, and
  Obsidian's trash is reachable only through the app, so the in-app plugin keeps that step.
- **Other providers are possible, not planned**: a GitHub Discussions "Ideas" category, the Discord `#ideas` forum,
  Notion. The interface is shaped so that none of them needs a change to `ideas sync`.

### Config

The workflow is the same whichever provider holds the notes, and where they are kept belongs to the provider:

```ts
providers: { ideas: ["obsidian", { dir: "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/The Holocron" }] },
ideas: { states: { file: "in-progress" } },
```

`HOLOCRON_IDEAS_DIR` stays as an override, read by the Obsidian provider. #2004 has already shipped `ideas.dir`, so the
provider reads `providers.ideas` first and falls back to `ideas.dir`, the way the `HOLOCRON_` variables fall back to the
bare names. The fallback is removed in a later change.

### What moves where

- **`plugins/holocron-plugin-obsidian`** (`@theholocron/holocron-plugin-obsidian`) implements `ideas`: listing the
  notes, parsing and patching frontmatter, finding attachments and embeds, skipping `_` and `.` folders, resolving the
  vault directory. It reads and writes files, so it has no token and no network. It follows the plugin template where it
  applies and needs no `auth.ts`.
- **The CLI** keeps `runIdeasSync`: read through `ideas`, file through `issues`, write the result back through
  `markFiled`. The files the vault code occupies in `commands/ideas-sync/` move out.
- **Nothing goes in `clients/`.** Obsidian has no API to wrap, and `clients/` holds API wrappers. A client would only
  be added if the plugin one day calls Obsidian's own CLI, and then as a shell wrapper like the 1Password plugin's.

### Steps for the maintainer

- The organization property `holocron_capabilities` must allow `ideas` before any repo can declare it
  (`holocron repo properties apply`, #1862); `doctor repo` reports it until then.
- The capability count in the docs, and the `CARDINALITY` table, change with it.

## Parts

### 1. `holocron ideas sync`

`holocron ideas sync [--dry-run] [--yes]`, a `workspace` command (it loads the `issues` provider, which the execution
contexts rule makes `workspace`) with a `COMMAND_CONTEXTS` and a `COMMAND_REGISTRY` entry.

- Reads every idea through the `ideas` provider. For the Obsidian provider that is every note in `dir`, except those in a
  folder whose name starts with `_` or `.` (`_templates/` for the note template, and Obsidian's own `.obsidian/` and
  `.trash/`).
- For each note in the filing state with no `issue:`, creates an issue and writes `issue:` into the note, in the
  tracker's own syntax (`#1234`, `RANDO-7`), which `specs check` already accepts. This is what makes the step run once.
- Prints a row through `printCheckRows` only for a note it files or one it skips for a reason the user can act on
  (an attachment, an unreadable file), and a summary that counts the rest (`3 filed, 1 skipped, 41 not ready`). A vault
  of hundreds of `seed` notes would otherwise bury the few that matter.
- Follows the other writers: asks first unless `--dry-run` or `--yes`, never deletes, is a no-op the second time, and a
  note it cannot file is a row, not the end of the run.
- **The CLI never deletes a note.** Without the plugin, a filed note stays in the vault with `issue:` set. Deleting from
  a command line is the riskier half, so it belongs to the plugin, which can use Obsidian's trash.
- A note with embedded attachments (an image or a file) is reported and skipped, because an issue body cannot carry
  them. An embedded note (`![[other note]]`) counts as one, since Obsidian uses the same syntax for both and the issue
  would show only the link.

The config is described under [Config](#config). `dir` can also come from `HOLOCRON_IDEAS_DIR`, since the path differs
per machine, and a bad shape is a `ConfigError` that names the path.

### 2. The Obsidian plugin: Council

This is an Obsidian plugin, not a Holocron plugin: Obsidian loads it (a single `main.js` built against the `obsidian`
API), not `PluginLoader`, so it does not belong in `plugins/`. It is named **Council**, after the Jedi Council where an
idea is argued out, in the repo's Star Wars naming for apps: `apps/council`, package `@theholocron/council`, plugin id
`holocron-council`. It is not deployed. The vault logic stays in `holocron-plugin-obsidian`; Council only calls the CLI.

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
2. Whether Council bundles the pure helpers of `holocron-plugin-obsidian` (it must stay one file Obsidian can load) or
   keeps its own small copy of the frontmatter patch. How it is installed (by hand, or through BRAT) is unchanged.
3. Whether a `dropped` note stays in the vault, or moves to an `_archive/` folder.
4. Whether `ideas sync` stays a command run by hand, or also runs on a schedule on a Mac.
