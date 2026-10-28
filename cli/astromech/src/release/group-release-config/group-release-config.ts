import { defineConfig } from "@theholocron/semantic-release-config";

import { folderScoped } from "../folder-scoped/index.js";
import type { GroupReleaseOptions } from "./group-release-config.type.js";

type PluginEntry = string | [string, Record<string, unknown> | undefined];

const GROUP = /^[a-z][a-z0-9-]*$/;

/**
 * A semantic-release config that releases one version group of a monorepo,
 * built on the org's `defineConfig()` so its rules, notes layout and plugin
 * order stay the same:
 *
 * - tags are `<group>-v<version>`, so each group finds its own last release;
 * - the commit analyzer and notes generator see only commits that touched the
 *   group's `paths` ({@link folderScoped});
 * - the changelog, the release commit's assets and its message are the group's.
 *
 * Run one `semantic-release` per group. Cross-group dependencies resolve from
 * the registry, so `paths` is the group's folder unless more is listed.
 */
export function groupReleaseConfig(options: GroupReleaseOptions): object {
	const { group, paths = [group], changelogFile = `${group}/CHANGELOG.md`, assets, ...rest } = options;
	if (!GROUP.test(group)) {
		throw new TypeError(
			`release group must be a lowercase folder name like "clients", got ${JSON.stringify(group)}`
		);
	}
	if (paths.length === 0) throw new TypeError(`release group ${JSON.stringify(group)} needs at least one path`);

	const base = defineConfig({
		...rest,
		assets: assets ?? [changelogFile, `${group}/**/package.json`, "!**/node_modules/**"],
	}) as { plugins: PluginEntry[] };

	const scope = (entry: PluginEntry): PluginEntry | [object, unknown] => {
		const [name, config] = Array.isArray(entry) ? entry : [entry, undefined];
		switch (name) {
			case "@semantic-release/commit-analyzer":
				return [folderScoped("analyzeCommits", paths), config];
			case "@semantic-release/release-notes-generator":
				return [folderScoped("generateNotes", paths), config];
			case "@semantic-release/changelog":
				return [name, { ...config, changelogFile }];
			case "@semantic-release/git":
				return [name, { ...config, message: groupMessage(config?.["message"] as string, group) }];
			default:
				return entry;
		}
	};

	return { ...base, tagFormat: `${group}-v\${version}`, plugins: base.plugins.map(scope) };
}

/** `chore(release): <version> …` becomes `chore(release): <group> <version> …`. */
function groupMessage(message: string, group: string): string {
	return message.replace(/^chore\(release\): /, `chore(release): ${group} `);
}
