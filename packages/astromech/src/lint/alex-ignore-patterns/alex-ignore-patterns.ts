/**
 * Glob-ish path patterns `alex` skips. Kept as a literal here rather than
 * importing `../templates/configs/alexjs/alexignore` directly — that file
 * (like `commit-msg`/`pre-push`) is deliberately extensionless, matching
 * the real filename `holocron repo setup` writes, which ECMAScript's own
 * module resolution (`moduleResolution: "nodenext"`) can't import across
 * a package boundary without an extension. Keep in sync with that file by
 * hand; it changes rarely.
 */
export const ALEX_IGNORE_PATTERNS: string[] = [".github/*", "CHANGELOG.md", "LICENSE"];
