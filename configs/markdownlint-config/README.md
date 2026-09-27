# Markdownlint Config

A [markdownlint configuration](https://github.com/DavidAnson/markdownlint) for consistent markdown documentation, compatible with `@theholocron/prettier-config`.

## Installation

```bash
pnpm add -D @theholocron/markdownlint-config markdownlint
```

## Usage

```js
import config from "@theholocron/markdownlint-config";
import { lint } from "markdownlint/promise";

const results = await lint({ config, files: ["README.md"] });
```

## Rule choices

- Starts from `markdownlint`'s own upstream `style/prettier` preset — every rule that would otherwise conflict with Prettier's markdown formatting (line length, emphasis/strong style, blank-line placement, indent width, hard tabs, trailing whitespace) is already off.
- **Inline HTML allowed** (`no-inline-html` off) — badges, `<details>`, `<sub>` show up throughout this org's docs.
- **No required leading H1** (`first-line-heading` off) — spec files and doc partials routinely open with something other than a top-level heading.
- **Duplicate headings only flagged within the same nesting level** (`duplicate-heading: { siblings_only: true }`) — a repeated heading text at a different level (a common TOC/section-per-subsystem pattern) is allowed.
