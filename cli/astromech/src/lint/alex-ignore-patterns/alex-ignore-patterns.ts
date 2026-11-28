/**
 * Glob-ish path patterns `alex` skips: the one copy of the list. It used to be mirrored by hand in an extensionless
 * `alexignore` template that `holocron setup` wrote into each repo as `.alexignore`; setup no longer writes it (#831), so
 * Sentinel's check and the Prettier ignore list read this.
 */
export const ALEX_IGNORE_PATTERNS: string[] = [".github/*", "CHANGELOG.md", "LICENSE"];
