/** Files that describe the old names on purpose: specs, ADRs, the changelog, tests, and this probe's own table. */
const SKIPPED = [
	/(^|\/)CHANGELOG\.md$/,
	/^\.notes\//,
	/^docs\/wiki\//,
	/\.test\.tsx?$/,
	/^cli\/cli\/src\/commands\/probe\/tasks\//,
];

/** The kinds of file the probe reads: workflows, scripts, docs, configs, hooks and manifests. */
const SCANNED = [
	/^\.github\/(workflows|actions)\/.+\.ya?ml$/,
	/^\.husky\//,
	/^scripts\//,
	/(^|\/)(package|turbo)\.json$/,
	/(^|\/)(holocron|astromech)\.config\.[cm]?[jt]s$/,
	/(^|\/)\.lintstagedrc/,
	/\.mdx?$/,
];

/** Whether `path` (repo-relative) is a hand-written kind of place to scan for old task names. */
export function isScanned(path: string): boolean {
	return SCANNED.some((p) => p.test(path)) && !SKIPPED.some((p) => p.test(path));
}
