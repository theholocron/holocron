# `@theholocron/holocron-plugin-obsidian`

Obsidian plugin for [Holocron](../../cli/cli). Implements the `ideas` capability over a vault of Markdown notes, so
`holocron sync ideas` can read ideas without knowing where they are kept. It reads and writes files only: there is no
token and no network.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-obsidian

```

## Config

<!-- prettier-ignore -->
```ts
providers: {
  ideas: ["obsidian", { vault: "The Holocron" }],
},
ideas: { states: { file: "in-progress" } },
```

### Options

| Option  | Required | Description                                                                                                                                                          |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault` | No       | The name of an Obsidian vault kept in iCloud Drive: the folder is `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>`. One folder name, no `/` or `\`. |
| `dir`   | No       | The folder of notes. A leading `~` is the home folder. `HOLOCRON_IDEAS_DIR` overrides it (the path differs per machine).                                             |

Most specific first: `HOLOCRON_IDEAS_DIR`, then `dir`, then `vault`. When both `dir` and `vault` are set, `dir` wins.

## What it does

- Lists every `.md` note under the folder except in folders whose name starts with `_` or `.`.
- Reads the `status:` and `issue:` properties, the title (first `#` heading, else the file name), the body and the
  attachments (embedded files and `![[other note]]`; not web-address images or anything inside a code fence).
- `setStatus` and `markFiled` write `status:` and `issue:` and leave the rest of the file byte for byte, CRLF included.
- `retire` is not implemented: the CLI never deletes a note.

## Documentation

See the [plugin page](https://docs.theholocron.dev/holocron/plugins/obsidian/).
