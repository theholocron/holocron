import { spawnSync } from "node:child_process";

import type { AlphaRelease } from "./alpha-release.type.js";

interface NpmView {
	version?: unknown;
	peerDependencies?: unknown;
}

/**
 * The release npm's `alpha` dist-tag points at for `name`, with the peer ranges it declares
 * (`npm view <name>@alpha version peerDependencies --json`).
 *
 * @returns `undefined` when the package or its `alpha` tag does not exist (npm's E404).
 * @throws when npm cannot be run or the registry cannot be reached: staging then would pin whatever is
 * installed, which is the stale version this lookup exists to replace.
 */
export function alphaRelease(name: string): AlphaRelease | undefined {
	const result = spawnSync("npm", ["view", `${name}@alpha`, "version", "peerDependencies", "--json"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) throw new Error(`cannot run npm to look up ${name}@alpha: ${result.error.message}`);
	if (result.status !== 0) {
		if (/E404|code E404/.test(`${result.stdout}${result.stderr}`)) return undefined;
		const reason =
			(result.stderr || result.stdout).split("\n").find((line) => line.trim()) ?? `exit ${result.status}`;
		throw new Error(`cannot look up ${name}@alpha on npm (is the registry reachable?): ${reason.trim()}`);
	}
	const parsed = JSON.parse(result.stdout) as string | NpmView;
	const view: NpmView = typeof parsed === "string" ? { version: parsed } : parsed;
	if (typeof view.version !== "string") return undefined;
	const peers = view.peerDependencies;
	return {
		version: view.version,
		...(peers && typeof peers === "object" ? { peerDependencies: peers as Record<string, string> } : {}),
	};
}
