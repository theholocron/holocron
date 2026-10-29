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
 * @see theholocron/holocron · docs/wiki/standards/markdownlint-rule-severity.md (full per-rule rationale)
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
 *
 * Severity curation (holocron#769/#860 drew the line this needed:
 * error-severity now posts an inline PR review comment and blocks merge
 * via Sentinel's markdownlint check; warning-severity stays an advisory
 * check-run annotation). Every rule below was reviewed individually —
 * full per-rule reasoning lives at the spec link above. Everything not
 * listed here keeps markdownlint's own default (`error`).
 *
 * Warning — cosmetic, subjective, or otherwise non-breaking:
 */
const config: Configuration = {
	...prettierStyle,
	"no-inline-html": false,
	"first-line-heading": false,
	"duplicate-heading": { siblings_only: true },
	// `single-title`/`single-h1` (MD025): still error-severity (a genuine
	// duplicate top-level heading is real breakage), but
	// `front_matter_title: ""` disables markdownlint's own default heuristic
	// that counts a frontmatter `title:` field as an implicit top-level
	// heading. This org's ADR/spec template (docs/wiki/decisions/,
	// docs/wiki/specifications/, .notes/*.spec.md) always pairs a
	// frontmatter `title:` with a real `# H1` by design — without this
	// override every one of those files' own H1 reads as a *second*
	// top-level heading and fails MD025. Found live: theholocron/holocron#967
	// touched two long-merged ADRs and was the first PR to re-lint either
	// since Sentinel's markdownlint check went live (it only lints changed
	// files) — surfacing a false positive that's been latent in every ADR
	// since the template's inception.
	"single-title": { front_matter_title: "" },
	// `fenced-code-language` (MD040): already markdownlint's own core
	// default (not part of `prettierStyle`, which doesn't mention it at
	// all), but declared here so it's guaranteed enforced org-wide rather
	// than an implicit default that could silently disappear if the
	// upstream preset ever changes. Warning, not error: affects syntax
	// highlighting only, a DX nicety rather than broken content.
	"fenced-code-language": { severity: "warning" },
	// `ul-style` (MD004): mixed bullet characters across a list — purely
	// visual, and Sentinel's own auto-fix-commit already resolves it
	// deterministically.
	"ul-style": { severity: "warning" },
	// `commands-show-output` (MD014): narrow, opinionated about
	// terminal-transcript style; reasonable writers disagree.
	"commands-show-output": { severity: "warning" },
	// `no-trailing-punctuation` (MD026): a period at the end of a
	// heading — pure style, zero functional impact.
	"no-trailing-punctuation": { severity: "warning" },
	// `no-bare-urls` (MD034): GitHub autolinks a bare URL on its own —
	// where this org's docs mostly render, there's no real breakage.
	"no-bare-urls": { severity: "warning" },
	// `no-emphasis-as-heading` (MD036): known false-positive tendency —
	// sometimes emphasis is just emphasis, not a heading in disguise.
	"no-emphasis-as-heading": { severity: "warning" },
	// `no-space-in-code` (MD038): same shape as `no-space-in-emphasis`,
	// but code spans tolerate it more gracefully in practice — a nit.
	"no-space-in-code": { severity: "warning" },
	// `no-space-in-links` (MD039): still a working link either way, just
	// untrimmed label text.
	"no-space-in-links": { severity: "warning" },
	// `code-block-style` (MD046): fenced vs. indented — pure preference
	// between two valid CommonMark forms.
	"code-block-style": { severity: "warning" },
	// `link-image-reference-definitions` (MD053): an unused reference
	// definition — dead-code clutter, doesn't break anything visible.
	"link-image-reference-definitions": { severity: "warning" },
	// `descriptive-link-text` (MD059): good writing advice, but a
	// subjective call, not a defect.
	"descriptive-link-text": { severity: "warning" },

	// Disabled outright — not a severity question, these overlap
	// something this org already disables elsewhere:
	//
	// `single-trailing-newline` (MD047): Sentinel's own editorconfig
	// check already enforces and auto-fixes `insert_final_newline` —
	// this would be the same correction from a second check.
	"single-trailing-newline": false,
	// `link-image-style` (MD054): same shape as `emphasis-style`/
	// `strong-style`, both already disabled by `prettierStyle` for being
	// pure preference.
	"link-image-style": false,
	// `table-pipe-style` (MD055): Prettier's own table formatting already
	// normalizes this — the reason `prettierStyle` exists at all.
	"table-pipe-style": false,
	// `blanks-around-tables` (MD058): same shape as `blanks-around-fences`/
	// `-headings`/`-lists`, all three already disabled by `prettierStyle`
	// for the same reason.
	"blanks-around-tables": false,
	// `table-column-style` (MD060): same table-formatting territory as
	// `table-pipe-style` — Prettier already owns this.
	"table-column-style": false,
};

export default config;
