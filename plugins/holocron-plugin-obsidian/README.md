# `@theholocron/holocron-plugin-obsidian`

Obsidian plugin for [Holocron](../../cli/cli). Implements the `ideas` capability over a vault of Markdown notes, so
`holocron ideas sync` can read ideas without knowing where they are kept. It reads and writes files only: there is no
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
  ideas: ["obsidian", { dir: "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/The Holocron" }],
},
ideas: { states: { file: "in-progress" } },
```

### Options

| Option | Required | Description                                                                                                              |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `dir`  | No       | The folder of notes. A leading `~` is the home folder. `HOLOCRON_IDEAS_DIR` overrides it (the path differs per machine). |

## What it does

- Lists every `.md` note under `dir` except in folders whose name starts with `_` or `.`.
- Reads the `status:` and `issue:` properties, the title (first `#` heading, else the file name), the body and the
  attachments (embedded files and `![[other note]]`; not web-address images or anything inside a code fence).
- `setStatus` and `markFiled` write `status:` and `issue:` and leave the rest of the file byte for byte, CRLF included.
- `retire` is not implemented: the CLI never deletes a note.

## Documentation

See the [plugin page](https://docs.theholocron.dev/holocron/plugins/obsidian/).
