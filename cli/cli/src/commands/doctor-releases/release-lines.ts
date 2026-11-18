import type { ReleaseLine } from "@theholocron/astromech";
import { releaseGroups, type TasksConfig } from "@theholocron/astromech/config";

import type { ReleasesIo } from "./doctor-releases.type.js";

/**
 * The lines a repo releases on, the way `release.config.ts` cuts them: one per version group named by the `release`
 * task (tags `<group>-v<version>`) and one for every public package outside them (tags `v<version>`). A line that
 * publishes no package, such as the `ci` group's private one, is left out: it has nothing on npm to compare.
 */
export function releaseLines(config: Pick<TasksConfig, "tasks">, io: Pick<ReleasesIo, "packages">): ReleaseLine[] {
	const groups = releaseGroups(config);
	const lines: ReleaseLine[] = [
		...groups.map((group) => ({ id: group, tagPrefix: `${group}-v`, packages: io.packages({ group }) })),
		{ id: "repo", tagPrefix: "v", packages: io.packages({ excludeGroups: groups }) },
	];
	return lines.filter((line) => line.packages.length > 0);
}
