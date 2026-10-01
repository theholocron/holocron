# Markdownlint rule severity

`@theholocron/markdownlint-config` assigns each active rule one of two
severities. Severity decides how Sentinel's markdownlint check
(`Source Quality / Documentation / Run markdownlint`) surfaces a finding:

| Severity  | Where it surfaces                                             | Blocks merge |
| --------- | ------------------------------------------------------------- | ------------ |
| `error`   | Inline PR review comment, in addition to the check annotation | Yes          |
| `warning` | Check-run annotation only                                     | No           |

Every enabled rule defaults to `error` unless listed under **Warning**
below. Rules disabled outright carry no severity at all — markdownlint
never evaluates them.

## Error

Real breakage: broken rendering, a dead link, or an accessibility gap.
Worth a reviewer's attention and worth blocking merge over.

| Rule                               | Why it's an error                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `heading-increment` (MD001)        | Skipping a heading level breaks the document outline screen readers and TOC generators rely on.       |
| `no-reversed-links` (MD011)        | `(text)[url]` renders as literal text, not a link — the content's actual intent is silently lost.     |
| `duplicate-heading` (MD024)        | Two headings with identical text under the same parent collide on their auto-generated anchor ID.     |
| `single-title`/`single-h1` (MD025) | More than one top-level heading muddies the document's own outline.                                   |
| `no-space-in-emphasis` (MD037)     | `* text *` with inner spaces breaks CommonMark's emphasis parsing — it renders as literal asterisks.  |
| `no-empty-links` (MD042)           | `[text]()` with no href goes nowhere — almost always a forgotten paste.                               |
| `no-alt-text` (MD045)              | Images with no alt text are invisible to screen readers.                                              |
| `link-fragments` (MD051)           | An in-page anchor that doesn't match a real heading is a broken link.                                 |
| `reference-links-images` (MD052)   | `[text][ref]` with no matching `[ref]: url` renders as literal bracket text — the link never existed. |
| `table-column-count` (MD056)       | A row with the wrong number of cells renders as a visibly broken table.                               |

`duplicate-heading` is configured `siblings_only: true` — it only catches
a duplicate at the same nesting level, not the same heading text reused
at different levels (a common TOC/section-per-subsystem pattern in this
org's longer docs).

## Warning

Cosmetic, subjective, or otherwise non-breaking. Several are also
auto-fixed by Sentinel's own auto-fix-commit, which removes any need for
a human to even act on the finding.

| Rule                                       | Why it's a warning                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `ul-style` (MD004)                         | Mixed bullet characters across a list — purely visual, and auto-fixed deterministically.              |
| `commands-show-output` (MD014)             | Opinionated about terminal-transcript style; reasonable writers disagree.                             |
| `no-trailing-punctuation` (MD026)          | A period at the end of a heading — zero functional impact.                                            |
| `no-bare-urls` (MD034)                     | GitHub autolinks a bare URL on its own — no real breakage where this org's docs mostly render.        |
| `no-emphasis-as-heading` (MD036)           | Known false-positive tendency — sometimes emphasis is just emphasis, not a heading in disguise.       |
| `no-space-in-code` (MD038)                 | Same shape as `no-space-in-emphasis`, but code spans tolerate it more gracefully in practice.         |
| `no-space-in-links` (MD039)                | Still a working link either way, just untrimmed label text.                                           |
| `fenced-code-language` (MD040)             | Affects syntax highlighting only — a DX nicety, not broken content.                                   |
| `code-block-style` (MD046)                 | Fenced vs. indented code blocks — pure preference between two valid CommonMark forms.                 |
| `link-image-reference-definitions` (MD053) | An unused reference definition — dead-code clutter, doesn't break anything visible.                   |
| `descriptive-link-text` (MD059)            | Flags generic link text like "click here" — good writing advice, but a subjective call, not a defect. |

## Disabled

Not a severity question — each of these overlaps something this org
already disables elsewhere, either in `markdownlint/style/prettier` (the
upstream Prettier-compatibility preset this config builds on) or in
Sentinel itself.

| Rule                              | Overlaps with                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `single-trailing-newline` (MD047) | Sentinel's own editorconfig check, which already enforces and auto-fixes `insert_final_newline`.     |
| `link-image-style` (MD054)        | Same family as `emphasis-style`/`strong-style`, already disabled by the Prettier preset.             |
| `table-pipe-style` (MD055)        | Prettier's own table formatting, which already normalizes pipe placement.                            |
| `blanks-around-tables` (MD058)    | Same family as `blanks-around-fences`/`-headings`/`-lists`, already disabled by the Prettier preset. |
| `table-column-style` (MD060)      | Same table-formatting territory as `table-pipe-style` — Prettier already owns it.                    |

Also disabled, for org-specific reasons unrelated to severity:

| Rule                                         | Why                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `no-inline-html` (MD033)                     | Badges, `<details>`/`<sub>`, and other raw HTML show up throughout this org's READMEs and wiki docs.     |
| `first-line-heading`/`first-line-h1` (MD041) | Spec files (`.notes/*.spec.md`) and doc partials routinely open with frontmatter-style prose, not an H1. |

## Not yet active

Two rules do nothing until given data to check against — not a severity
decision, a configuration one:

| Rule                        | Needs                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `required-headings` (MD043) | A `headings` array describing the structure to enforce.                              |
| `proper-names` (MD044)      | A `names` array of terms with required capitalization (e.g. "GitHub," not "github"). |

Configuring either is a separate decision from the severity curation
above — worth revisiting if this org wants a specific document template
or consistent brand-name capitalization enforced automatically.
