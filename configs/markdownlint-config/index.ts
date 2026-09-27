import type { Configuration } from "markdownlint";
// `markdownlint`'s own upstream preset for exactly this purpose — disables
// every rule that would otherwise conflict with Prettier's own markdown
// formatting decisions (line-length, emphasis/strong style, blank-line
// placement around fences/headings/lists, indent width, hard tabs, trailing
// whitespace, heading/hr style). Spread in rather than hand-copied, so a
// `markdownlint` version bump carries any upstream additions to this list
// automatically — same "reuse the real thing, don't reimplement its rules"
// reasoning `@theholocron/prettier-config`/`ALEX_CONFIG` already established.
import prettierStyle from "markdownlint/style/prettier" with { type: "json" };

/**
 * @see https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md
 *
 * Org-specific additions on top of the upstream Prettier-compatibility
 * preset, none of which that preset already covers:
 *
 * - `no-inline-html` (MD033): off. Badges, `<details>`/`<sub>`, and other
 *   raw HTML show up throughout this org's READMEs and wiki docs — same
 *   "advisory, not overly strict" stance `ALEX_CONFIG` takes.
 * - `first-line-heading`/`first-line-h1` (MD041): off. Spec files
 *   (`.notes/*.spec.md`) and doc partials routinely don't open with an H1
 *   — frontmatter-style prose or a directive comment comes first instead.
 * - `duplicate-heading` (MD024): `siblings_only: true`, not a blanket
 *   disable — still catches a genuine duplicate at the same nesting level,
 *   but allows the same heading text at different levels (a common
 *   TOC/section-per-subsystem pattern in this org's longer docs).
 */
const config: Configuration = {
	...prettierStyle,
	"no-inline-html": false,
	"first-line-heading": false,
	"duplicate-heading": { siblings_only: true },
};

export default config;
