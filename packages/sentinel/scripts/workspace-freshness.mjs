/**
 * Guards `stage-deploy.mjs` against pinning a stale workspace dependency
 * (holocron#919). The staged `package.json` pins each `@theholocron/*`
 * workspace dependency to the version in the local checkout, and Vercel
 * installs that version from npm — not the local source Sentinel's own
 * `dist/` was built against. A checkout that has a merged change but not
 * yet its `chore(release)` commit pins the *previous* release, which
 * exists on npm (so the install succeeds) but lacks the change. Found
 * live: Sentinel's `dist/` imported `mergeTasksLayers` (holocron#917)
 * while Vercel installed `@theholocron/astromech@5.0.0-alpha.99`, and
 * every webhook crashed on import.
 *
 * The check: semantic-release tags every release `v<version>`, so a
 * workspace package's published content is its source at that tag. If
 * the package's `src/` or `package.json` differs between the tag and the
 * working tree (tests excluded), npm doesn't have what Sentinel was built
 * against, and staging refuses.
 *
 * Its own module, not inlined in `stage-deploy.mjs`, so it can be
 * unit-tested with a fake `git` runner.
 */

/**
 * @param {{ deps: { name: string; version: string; dir: string }[]; git: (args: string[]) => { status: number | null; stdout: string } }} input
 *   `dir` is the package's directory relative to the repo root; `git`
 *   runs a git command in the repo root.
 * @returns {string[]} One problem per stale or unverifiable dependency; empty when all are current.
 */
export function staleWorkspaceDeps({ deps, git }) {
	const problems = [];
	for (const { name, version, dir } of deps) {
		const tag = `v${version}`;
		if (git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).status !== 0) {
			problems.push(`${name}@${version}: no local tag ${tag} to compare against — run \`git fetch --tags\``);
			continue;
		}
		const pathspec = [`${dir}/src`, `${dir}/package.json`, ":(exclude,glob)**/*.test.ts"];
		const changed = git(["diff", "--name-only", tag, "--", ...pathspec])
			.stdout.split("\n")
			.filter(Boolean);
		if (changed.length > 0) {
			problems.push(
				`${name}@${version}: ${changed.length} file(s) changed since ${tag} was published (${changed.join(", ")})`
			);
		}
	}
	return problems;
}
