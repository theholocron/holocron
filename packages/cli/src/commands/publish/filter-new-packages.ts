import { pad, statusRow } from "../../ui/index.js";
import type { PublicPackageEntry } from "./public-package-entry.type.js";
import type { PublishExecResult, PublishPrint } from "./publish.type.js";

/**
 * Keeps only the entries that don't exist on npm yet — the actual
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
 *
 * Prints one `statusRow("skip", …)` line per already-published entry as it
 * finds them — same shape `clone` uses for an already-cloned repo, with the
 * registry's own version (not the local one) in the message, since that's
 * what "already published" actually means — so the caller's own summary
 * line is the only other thing it needs to print. `nameWidth`/`dirWidth`
 * (computed by the caller across every discovered entry, not just the ones
 * landing here) keep these rows column-aligned with the "would
 * publish"/"published" rows the caller prints afterward for the entries
 * that come back from this function — the two sets only read as one table
 * when both pad to the same widths.
 */
export async function filterNewPackages(
	entries: readonly PublicPackageEntry[],
	cwd: string,
	exec: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>,
	print: PublishPrint,
	nameWidth: number,
	dirWidth: number
): Promise<PublicPackageEntry[]> {
	const results: PublicPackageEntry[] = [];
	for (const entry of entries) {
		const view = await exec("npm", ["view", entry.name, "version"], { cwd });
		const publishedVersion = view.exitCode === 0 ? view.stdout.trim() : "";
		if (publishedVersion) {
			print(
				statusRow("skip", [
					pad(entry.name, nameWidth),
					pad(entry.dir, dirWidth),
					`already published (v${publishedVersion})`,
				])
			);
			continue;
		}
		results.push(entry);
	}
	return results;
}
