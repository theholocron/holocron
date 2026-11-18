import { spawnSync } from "node:child_process";

import type { GitTag } from "@theholocron/astromech";

import { discoverPublicPackages } from "../publish/discover-public-packages.js";
import type { ReleasesIo } from "./doctor-releases.type.js";

const REGISTRY = "https://registry.npmjs.org";

/** Reads `git for-each-ref` output: one `<tag> <unix time>` per line. */
export function parseTagList(output: string): GitTag[] {
	return output.split("\n").flatMap((line) => {
		const [name, time] = line.trim().split(" ");
		if (!name) return [];
		const createdAt = Number(time);
		return [{ name, ...(Number.isFinite(createdAt) && time ? { createdAt } : {}) }];
	});
}

/** `doctor releases`' inputs from the real git checkout under `repoRoot`, the npm registry and the workspace. */
export function realReleasesIo(repoRoot: string): ReleasesIo {
	/* v8 ignore start -- reads git, the network and the filesystem; the check is tested with an injected io */
	return {
		tags: () => {
			const result = spawnSync(
				"git",
				["for-each-ref", "--format=%(refname:short) %(creatordate:unix)", "refs/tags"],
				{
					cwd: repoRoot,
					encoding: "utf8",
				}
			);
			if (result.status !== 0) throw new Error(`git for-each-ref failed: ${result.stderr.trim()}`);
			return parseTagList(result.stdout);
		},
		packages: (scope) => [...discoverPublicPackages(repoRoot, scope)],
		distTags: async (name) => {
			const response = await fetch(`${REGISTRY}/-/package/${name.replace("/", "%2f")}/dist-tags`);
			if (response.status === 404) return undefined;
			if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
			return (await response.json()) as Record<string, string>;
		},
		now: () => Math.floor(Date.now() / 1000),
	};
	/* v8 ignore stop */
}
