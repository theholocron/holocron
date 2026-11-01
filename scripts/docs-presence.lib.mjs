/**
 * The pure parts of `validate-docs-presence.mjs`: finding the packages a feature changed, deciding whether the PR
 * carries a docs signal for each, and reading the `[skip docs]` escape hatch. No git and no filesystem here, so the
 * logic is tested on its own (`docs-presence.lib.test.mjs`).
 */

/**
 * `[skip docs] reason`, or `[skip docs: pkg-a, pkg-b] reason`, on one line of a PR description or commit body. Like
 * semantic-release's `[skip ci]`, but the reason after it is required for the marker to count.
 *
 * @param {string} text PR description and commit messages, joined.
 * @returns {{ scope: string[] | null, reason: string } | null} `null` when there is no marker; `scope` is `null` for
 *   "every package"; `reason` is empty when the marker has none.
 */
export function parseSkipDocs(text) {
	const match = /\[skip docs(?::\s*([^\]]*?))?\][ \t]*([^\n]*)/i.exec(text);
	if (!match) return null;
	const scope = match[1]
		? match[1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: null;
	return { scope, reason: (match[2] ?? "").trim() };
}

/**
 * Whether any of the PR's titles or commit subjects is a Conventional Commit `feat` (`feat:`, `feat(scope):`,
 * `feat!:`), with an optional gitmoji after the type.
 *
 * @param {string[]} subjects
 */
export function isFeat(subjects) {
	return subjects.some((s) => /^feat(\([^)]*\))?!?:/i.test(s.trim()));
}

/**
 * The package a changed source file belongs to: the nearest folder above it that has a `package.json`, when the
 * file is the package's source (`src/**`, or `index.ts` at the package root) and the package is public.
 *
 * @param {string} file Repo-relative path.
 * @param {(dir: string) => { private?: boolean } | undefined} readPackage `package.json` of a repo-relative dir, or
 *   `undefined` when there is none.
 * @returns {string | undefined} The package dir (for example `utils/array-utils`).
 */
export function packageOf(file, readPackage) {
	if (file.includes("node_modules/") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return undefined;
	const parts = file.split("/");
	for (let i = parts.length - 1; i > 0; i--) {
		const dir = parts.slice(0, i).join("/");
		const pkg = readPackage(dir);
		if (!pkg) continue;
		if (pkg.private) return undefined;
		const inside = parts.slice(i).join("/");
		return inside.startsWith("src/") || /^index\.[cm]?[jt]s$/.test(inside) ? dir : undefined;
	}
	return undefined;
}

/**
 * Names under which a package's docs page can be found: its folder name, and the name without the `-client` or
 * `holocron-plugin-` part its page drops (`axiom-client` is `clients/axiom.mdx`).
 *
 * @param {string} dir
 */
export function pageNames(dir) {
	const name = dir.split("/").at(-1) ?? dir;
	return [...new Set([name, name.replace(/-client$/, ""), name.replace(/^holocron-plugin-/, "")])];
}

/**
 * Whether the PR touches this package's documentation: its README, a docs page named after it, or a doc comment in
 * its source.
 *
 * @param {string} dir The package dir.
 * @param {string[]} changedFiles Every file the PR changed.
 * @param {string[]} addedCommentLines The `+` lines of the diff of the package's source that are doc comments.
 */
export function hasDocsSignal(dir, changedFiles, addedCommentLines) {
	if (addedCommentLines.length > 0) return true;
	const names = pageNames(dir);
	return changedFiles.some((f) => {
		if (f === `${dir}/README.md`) return true;
		if (!f.startsWith("docs/") || !/\.mdx?$/.test(f)) return false;
		const base = f
			.split("/")
			.at(-1)
			?.replace(/\.mdx?$/, "");
		return names.includes(base ?? "");
	});
}

/**
 * Does a `+` diff line add a doc comment line (`/**`, ` * text`, ` *`/)?
 *
 * @param {string} line
 */
export function isAddedDocComment(line) {
	return /^\+\s*(\/\*\*|\*(\s|\/|$))/.test(line);
}

/**
 * The packages a feature changed without a docs signal, and the ones a `[skip docs]` marker covered.
 *
 * @param {{
 *   packages: string[],
 *   changedFiles: string[],
 *   addedCommentLines: (dir: string) => string[],
 *   skip: { scope: string[] | null, reason: string } | null,
 * }} input
 * @returns {{ warn: string[], skipped: { dir: string, reason: string }[], missingReason: boolean }}
 */
export function evaluate({ packages, changedFiles, addedCommentLines, skip }) {
	const warn = [];
	const skipped = [];
	let missingReason = false;
	for (const dir of packages) {
		if (hasDocsSignal(dir, changedFiles, addedCommentLines(dir))) continue;
		const covered =
			skip && (skip.scope === null || skip.scope.some((s) => pageNames(dir).includes(s) || s === dir));
		if (covered && skip.reason) skipped.push({ dir, reason: skip.reason });
		else {
			if (covered) missingReason = true;
			warn.push(dir);
		}
	}
	return { warn, skipped, missingReason };
}
