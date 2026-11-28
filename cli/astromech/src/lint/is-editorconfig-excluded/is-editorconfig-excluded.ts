import { EDITORCONFIG_CHECKER_EXCLUDE } from "../editorconfig-checker-exclude/index.js";

/** `true` when `path` matches any {@link EDITORCONFIG_CHECKER_EXCLUDE} pattern. */
export function isEditorConfigExcluded(path: string): boolean {
	return EDITORCONFIG_CHECKER_EXCLUDE.some((pattern) => new RegExp(pattern).test(path));
}
