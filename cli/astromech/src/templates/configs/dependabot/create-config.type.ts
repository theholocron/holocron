export interface DependabotConfigOptions {
	/**
	 * Packages Dependabot must not raise version updates for, by exact name. Each becomes a name-only
	 * `ignore` entry on the npm ecosystem. Security updates are not affected: for those, Dependabot
	 * only honours an `ignore` entry that lists `versions`.
	 */
	ignore?: readonly string[];
}
