# Holocron Ideas (Obsidian plugin)

An Obsidian plugin for the ideas vault ([SPEC-0072](https://github.com/theholocron/holocron/issues/1994)). It adds two commands:

- **File this idea** (command palette and a ribbon button) acts on the open note. It sets `status` to the filing state, runs `holocron ideas sync --yes` on desktop, and moves the note to Obsidian's trash only once the note carries an `issue:`.
- **Set idea status** shows a picker of the configured states (`seed`, `exploring`, `in-progress`, `dropped`) and sets `status` on the open note. Obsidian's property editor has no fixed list.

This is a private app: it is not published to npm and has no release of its own.

## Build

```sh
pnpm install
pnpm --filter @theholocron/obsidian-ideas build
```

The build writes `dist/main.js` and `dist/manifest.json`. `main.js` is one CommonJS file; `obsidian` and the Node builtins are left for the app to supply.

## Install

Copy `main.js` and `manifest.json` from `dist/` into `<vault>/.obsidian/plugins/holocron-ideas/`, then turn the plugin on under Settings, Community plugins. Install it on each device that should run the commands. A plugin folder inside an iCloud vault syncs to the other devices by itself, so one copy is enough, but only a Mac can file.

## Settings

| Setting            | Default                                 | Meaning                                                                    |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| Holocron repo path | empty                                   | The checkout the command runs in. Required for filing.                     |
| Command            | `pnpm exec holocron`                    | What starts the CLI. Use the full path if the app cannot find the program. |
| States             | `seed, exploring, in-progress, dropped` | The values the picker offers. Match the `ideas` block of `holocron.config` |
| Filing state       | `in-progress`                           | The state that files the idea.                                             |

## How filing works

1. Refuse when the note is already in the filing state and has an `issue:`.
2. Set `status` to the filing state, through Obsidian's `processFrontMatter`.
3. On desktop, run the command in the repo path with `HOLOCRON_IDEAS_DIR` set to the vault's folder.
4. Read the note again. Move it to the trash only if it now has an `issue:`.
5. Otherwise leave it, restore nothing, and show a notice with the end of the command's output (a skipped attachment, an error). A non-zero exit never trashes.

`ideas sync` files every ready note in the vault, not only the open one, and moves nothing itself. This plugin trashes only the open note.

## Limits

- **Filing is desktop only.** On iOS there is no checkout, shell or git, so the command only sets the state. The note is filed the next time a Mac runs **File this idea** on it.
- **A GUI app may not see your shell's PATH.** Obsidian started from the Dock does not read your shell profile, so `pnpm` or `node` can be missing. The plugin adds `/opt/homebrew/bin` and `/usr/local/bin` to `PATH`; if that is not enough, put the full path in the Command setting, for example `/opt/homebrew/bin/pnpm exec holocron`.
- **No token field, ever.** The plugin's `data.json` is a file in the vault, and iCloud syncs it to every device. The CLI reads its tokens through its own chain on the Mac.
- It has not been run inside Obsidian by the tests: they cover the decisions and the order with a mock of the Obsidian API.

See [the docs page](https://docs.theholocron.dev/holocron/obsidian-ideas/) and [`ideas sync`](https://docs.theholocron.dev/holocron/commands/ideas-sync/).
