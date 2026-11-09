import type { AlphaReleaseLookup } from "../alpha-release/index.js";
import type { PinnedAlphaReleases } from "./pin-alpha-releases.type.js";

const OWN_SCOPE = "@theholocron/";
const ALPHA_VERSION = /-alpha\./;
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Moves every `@theholocron/*` dependency installed at an `alpha` prerelease to the version npm's `alpha` tag points
 * at. A workspace package's `package.json` keeps the version it had when it was last committed, and a release only
 * writes the new one into the published copy, so the installed version of a plugin can be hundreds of releases behind
 * what npm serves, with a peer on a CLI it was never published with. A version that is not an `alpha` prerelease, a
 * package outside the scope and a package npm has no `alpha` tag for stay as they are.
 *
 * `mismatches` lists each exact peer a pinned release declares (`@theholocron/cli` is one) that differs from the
 * version staged for it, so a release cut between two lookups shows up instead of failing at runtime.
 */
export function pinAlphaReleases(
	dependencies: Record<string, string>,
	lookup: AlphaReleaseLookup
): PinnedAlphaReleases {
	const pinned: Record<string, string> = {};
	const changes: string[] = [];
	const peerRanges: [string, string, Record<string, string>][] = [];
	for (const [name, version] of Object.entries(dependencies)) {
		const release = name.startsWith(OWN_SCOPE) && ALPHA_VERSION.test(version) ? lookup(name) : undefined;
		pinned[name] = release?.version ?? version;
		if (release && release.version !== version) changes.push(`${name} ${version} → ${release.version}`);
		if (release?.peerDependencies) peerRanges.push([name, release.version, release.peerDependencies]);
	}
	const mismatches = peerRanges.flatMap(([name, version, peers]) =>
		Object.entries(peers)
			.filter(([peer, range]) => peer in pinned && EXACT_VERSION.test(range) && pinned[peer] !== range)
			.map(([peer, range]) => `${name}@${version} peers ${peer}@${range}, but ${peer}@${pinned[peer]} is staged`)
	);
	return { dependencies: pinned, changes, mismatches };
}
