import { defineConfig } from "@theholocron/semantic-release-config";

import { ungroupedScoped } from "../folder-scoped/index.js";
import type { UngroupedReleaseOptions } from "./ungrouped-release-config.type.js";

type PluginEntry = string | [string, Record<string, unknown> | undefined];

/**
 * The semantic-release config for everything that is in no version group, built on the org's
 * `defineConfig()`: tags, changelog and release commit are the repo's own, as before. The commit
 * analyzer and notes generator skip commits confined to the `groups` folders, because those
 * belong to the groups' releases ({@link ungroupedScoped}). With no groups it is `defineConfig()`
 * unchanged.
 */
export function ungroupedReleaseConfig({ groups, ...options }: UngroupedReleaseOptions): object {
	const base = defineConfig(options) as { plugins: PluginEntry[] };
	if (groups.length === 0) return base;

	const scope = (entry: PluginEntry): PluginEntry | [object, unknown] => {
		const [name, config] = Array.isArray(entry) ? entry : [entry, undefined];
		switch (name) {
			case "@semantic-release/commit-analyzer":
				return [ungroupedScoped("analyzeCommits", groups), config];
			case "@semantic-release/release-notes-generator":
				return [ungroupedScoped("generateNotes", groups), config];
			default:
				return entry;
		}
	};
	return { ...base, plugins: base.plugins.map(scope) };
}
