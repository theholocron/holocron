# Holocron Council (Obsidian plugin)

An Obsidian plugin for the ideas vault ([SPEC-0072](https://github.com/theholocron/holocron/issues/1994)). It adds two commands:

- **File this idea** (command palette and a ribbon button) acts on the open note. It sets `status` to the filing state, runs `holocron sync ideas --yes` on desktop, and moves the note to Obsidian's trash only once the note carries an `issue:`.
- **Set idea status** shows a picker of the configured states (`seed`, `exploring`, `in-progress`, `dropped`) and sets `status` on the open note. Obsidian's property editor has no fixed list.

This is a private app: it is not published to npm and has no release of its own.

## Build

```sh
pnpm install
pnpm --filter @theholocron/council build
```

The build writes `dist/main.js` and `dist/manifest.json`. `main.js` is one CommonJS file; `obsidian` and the Node builtins are left for the app to supply.

## Install

Copy `main.js` and `manifest.json` from `dist/` into `<vault>/.obsidian/plugins/holocron-council/`, then turn the plugin on under Settings, Community plugins. The [docs page](https://docs.theholocron.dev/holocron/council/) has the full steps: build, copy, turn on, the settings, and a dry run to check it. The settings sync to every Mac with the vault, so write the repo path with `~` and leave the login shell option on. When you change the login shell setting, update and restart Council on every Mac first: an older copy saves its settings without that field, and the default (on) comes back. Install it on each device that should run the commands. A plugin folder inside an iCloud vault syncs to the other devices by itself, so one copy is enough, but only a Mac can file.

## Settings

| Setting                    | Default                                 | Meaning                                                                                                          |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Holocron repo path         | empty                                   | The checkout the command runs in. A leading `~` is the home folder. Required for filing.                         |
| Run through my login shell | on                                      | Starts the command in your login shell, so `node` and `pnpm` are found as in a terminal. About 2 seconds slower. |
| Command                    | `pnpm exec holocron`                    | What starts the CLI. With the shell option off, give full paths. A leading `~` is the home folder.               |
| States                     | `seed, exploring, in-progress, dropped` | The values the picker offers. Match the `ideas` block of `holocron.config`                                       |
| Filing state               | `in-progress`                           | The state that files the idea.                                                                                   |

## How filing works

1. Refuse when the note is already in the filing state and has an `issue:`.
2. Set `status` to the filing state, through Obsidian's `processFrontMatter`.
3. On desktop, run the command in the repo path (with `~` expanded) with `HOLOCRON_IDEAS_DIR` set to the vault's folder, through your login shell unless that option is off.
4. Read the note again. Move it to the trash only if it now has an `issue:`.
5. Otherwise leave it, restore nothing, and show a notice with the end of the command's output (a skipped attachment, an error). A non-zero exit never trashes.

`sync ideas` files every ready note in the vault, not only the open one, and moves nothing itself. This plugin trashes only the open note.

## Limits

- **Filing is desktop only.** On iOS there is no checkout, shell or git, so the command only sets the state. The note is filed the next time a Mac runs **File this idea** on it.
- **A GUI app may not see your shell's PATH.** Obsidian started from the Dock does not read your shell profile, so `pnpm` or `node` can be missing. The login shell option fixes that on every Mac. With it off, the plugin only adds `/opt/homebrew/bin` and `/usr/local/bin` to `PATH`; put full paths in the Command setting, which differ between Macs.
- **One filing run at a time.** A second **File this idea** during a run shows a notice and starts nothing. This covers one Obsidian instance only. Overlapping runs from elsewhere (a terminal, a second Mac) are handled by [`sync ideas`](https://docs.theholocron.dev/holocron/commands/sync-ideas/): after it creates an issue it searches for the note's marker again, and when an older open issue carries it, it comments on and closes its own issue and records the older key, so both runs end with the same key. The duplicate is moved to the tracker's done state: closed as completed on GitHub, and on Linear the team's completed state, or its canceled state if the team has none. This depends on the search seeing both issues. If it misses a twin (a lagging index, or an error in the search), the run keeps its own issue, so the runs can record different keys and an extra open issue can remain; close it by hand. If commenting on or closing the duplicate is rejected, the note still gets the older key and a warning row names both issues, and the duplicate stays open until it is closed by hand.
- **Login shell families.** The option supports `sh`, `bash`, `zsh`, `dash` and `ksh`; another shell, such as fish, runs the command directly with a notice.
- **No token field, ever.** The plugin's `data.json` is a file in the vault, and iCloud syncs it to every device. The CLI reads its tokens through its own chain on the Mac.
- It has not been run inside Obsidian by the tests: they cover the decisions and the order with a mock of the Obsidian API.

See [the docs page](https://docs.theholocron.dev/holocron/council/) and [`sync ideas`](https://docs.theholocron.dev/holocron/commands/sync-ideas/).
