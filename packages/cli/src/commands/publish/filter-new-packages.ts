import type { PublishExecResult } from "./publish.type.js";

/**
 * Keeps only the names that don't exist on npm yet — the actual
 * chicken-and-egg case `--initial` exists for (ADR: npm requires a package
 * to exist before Trusted Publishing can be configured on it). Once a name
 * exists on npm at all, regardless of version, Trusted Publishing can
 * already be configured for it and every later version goes through the
 * steady-state publish instead — re-running `--initial` against it would
 * just hit a stale `pnpm publish` with no `--skip-already-published` safety
 * net. Existence, not version: unlike the steady-state publish's own
 * already-published check, this intentionally ignores the local version —
 * a package that exists on npm at an older version is still not `--initial`'s
 * problem.
 */
export async function filterNewPackages(
	packageNames: readonly string[],
	cwd: string,
	exec: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>
): Promise<string[]> {
	const results: string[] = [];
	for (const name of packageNames) {
		const view = await exec("npm", ["view", name, "version"], { cwd });
		const alreadyExists = view.exitCode === 0 && view.stdout.trim().length > 0;
		if (!alreadyExists) results.push(name);
	}
	return results;
}
