/** What varies in the generated `.github/dependabot.yml`; the rest of the file is the same for every repo. */
export interface DependabotConfigOptions {
	/**
	 * Packages Dependabot must not raise version updates for, by exact name. Each becomes a name-only
	 * `ignore` entry on the npm ecosystem. Security updates are not affected: for those, Dependabot
	 * only honours an `ignore` entry that lists `versions`.
	 */
	ignore?: readonly string[];

	/**
	 * Directories, besides `.github/workflows` (`/`), whose workflow and action files the github-actions ecosystem
	 * watches: the sources a repo generates its workflows from. Dependabot does not bump those otherwise, so
	 * `probe generated check` fails on the difference. Globs are allowed.
	 */
	sources?: readonly string[];
}
