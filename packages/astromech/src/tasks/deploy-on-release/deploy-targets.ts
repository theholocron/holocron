import { normalizeTaskEntry } from "../../config/schema.js";
import type { TasksConfig } from "../../config/schema.type.js";
import { DEPLOY_TASK, MAIN_CHANNEL } from "./constants.js";
import type { DeployTarget, WorkspacePackage } from "./deploy-on-release.type.js";

/**
 * The packages whose manifest declares a release-time `delivery.deploy`
 * (`with.on === "release"`), with the task's options resolved.
 */
export function deployTargets(packages: WorkspacePackage[], manifests: Map<string, TasksConfig>): DeployTarget[] {
	return packages.flatMap((pkg) =>
		(manifests.get(pkg.dir)?.tasks ?? []).flatMap((item) => {
			const entry = normalizeTaskEntry(item);
			if (entry.name !== DEPLOY_TASK || entry.with?.["on"] !== "release") return [];
			const { channel, paths } = entry.with;
			return [
				{
					pkg,
					channel: typeof channel === "string" ? channel : MAIN_CHANNEL,
					paths: Array.isArray(paths) ? paths.map(String) : undefined,
				},
			];
		})
	);
}
