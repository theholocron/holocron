/**
 * The paths editorconfig-checker skips, read from the same
 * `editorconfig-checker.json` template `holocron setup` writes as a repo's
 * `.editorconfig-checker.json` — so Sentinel's central editorconfig check
 * (holocron#927) excludes exactly what CI's editorconfig-checker does, from
 * one source.
 *
 * The exclusion that matters most is `\.md$` / `\.mdx$`: the generated
 * `.editorconfig` gives every file tab indentation, but
 * `@theholocron/prettier-config` formats markdown with spaces, so a README's
 * indented code example would fail one tool or the other. Markdown is left
 * to prettier and markdownlint.
 *
 * Each entry is a regular-expression source, matched against a
 * repo-relative path, as editorconfig-checker itself treats them.
 */

import editorconfigChecker from "../templates/configs/editorconfig-checker/editorconfig-checker.json" with { type: "json" };

export const EDITORCONFIG_CHECKER_EXCLUDE: readonly string[] = editorconfigChecker.Exclude;

/** `true` when `path` matches any {@link EDITORCONFIG_CHECKER_EXCLUDE} pattern. */
export function isEditorConfigExcluded(path: string): boolean {
	return EDITORCONFIG_CHECKER_EXCLUDE.some((pattern) => new RegExp(pattern).test(path));
}
