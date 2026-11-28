import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

interface PeerManifest {
	version?: string;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

/**
 * The `package.json` of `peer` as the package at `manifestPath` would resolve it: the closest `node_modules`
 * above its real path, which in a pnpm install is the sibling link next to the dependency.
 */
function peerManifestPath(manifestPath: string, peer: string): string | undefined {
	for (let dir = dirname(manifestPath); dirname(dir) !== dir; dir = dirname(dir)) {
		const candidates = [join(dir, "node_modules", peer, "package.json")];
		if (basename(dir) === "node_modules") candidates.push(join(dir, peer, "package.json"));
		const found = candidates.find((candidate) => existsSync(candidate));
		if (found) return realpathSync(found);
	}
	return undefined;
}

/** Adds the required peers of the package at `manifestPath` to `peers`, then theirs, each once. */
function collectPeers(manifestPath: string, peers: Record<string, string>): void {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PeerManifest;
	for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
		if (manifest.peerDependenciesMeta?.[peer]?.optional || peer in peers) continue;
		const peerPath = peerManifestPath(manifestPath, peer);
		if (!peerPath) continue;
		const peerManifest = JSON.parse(readFileSync(peerPath, "utf8")) as PeerManifest;
		if (!peerManifest.version) continue;
		peers[peer] = peerManifest.version;
		collectPeers(peerPath, peers);
	}
}

/**
 * The required peer dependencies of the installed `dependency` and, in turn, of those peers, each with the
 * version installed beside the package that needs it. A peer that is optional, or that is not installed, is
 * left out. The staged payload installs with `legacy-peer-deps`, which turns off npm's own peer installation,
 * so these have to be listed.
 */
export function installedPeers(packageDir: string, dependency: string): Record<string, string> {
	const manifestPath = join(packageDir, "node_modules", dependency, "package.json");
	if (!existsSync(manifestPath)) return {};
	const peers: Record<string, string> = {};
	collectPeers(realpathSync(manifestPath), peers);
	return peers;
}
