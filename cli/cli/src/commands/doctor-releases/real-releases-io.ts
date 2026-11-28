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

/** The effects `realReleasesIo()` uses, so a test can stand in for git, the network and the workspace. */
export interface RealReleasesDeps {
	spawn: (
		command: string,
		args: string[],
		options: { cwd: string; encoding: "utf8" }
	) => { status: number | null; stdout: string; stderr: string };
	fetch: (url: string) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;
	discover: (repoRoot: string, scope: { group?: string; excludeGroups?: readonly string[] }) => readonly string[];
	nowMs: () => number;
}

const defaultDeps: RealReleasesDeps = {
	spawn: (command, args, options) => spawnSync(command, args, options),
	fetch: (url) => fetch(url),
	discover: discoverPublicPackages,
	nowMs: () => Date.now(),
};

/** `doctor releases`' inputs from the real git checkout under `repoRoot`, the npm registry and the workspace. */
export function realReleasesIo(repoRoot: string, deps: RealReleasesDeps = defaultDeps): ReleasesIo {
	return {
		tags: () => {
			const result = deps.spawn(
				"git",
				["for-each-ref", "--format=%(refname:short) %(creatordate:unix)", "refs/tags"],
				{ cwd: repoRoot, encoding: "utf8" }
			);
			if (result.status !== 0) throw new Error(`git for-each-ref failed: ${result.stderr.trim()}`);
			return parseTagList(result.stdout);
		},
		packages: (scope) => [...deps.discover(repoRoot, scope)],
		distTags: async (name) => {
			const response = await deps.fetch(`${REGISTRY}/-/package/${name.split("/").join("%2f")}/dist-tags`);
			// npm answers 404 for an unknown package and 401 for an unknown scoped one (checked against the registry).
			if (response.status === 404 || response.status === 401) return undefined;
			if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
			return (await response.json()) as Record<string, string>;
		},
		now: () => Math.floor(deps.nowMs() / 1000),
	};
}
