import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { AppPlan } from "./app-plan.type.js";

/**
 * Reads what an app's own config declares: its `deployment` and `workers` providers and whether `repo.secrets.deploy`
 * lists anything. An app is classified by this, never by its name, so a new app needs no change here; an app with no
 * config declares nothing.
 *
 * @param config - The app's resolved config, if it has one.
 */
export function appPlan(config: ResolvedHolocronConfig | undefined): AppPlan {
	const deployment = config?.providers.deployment;
	const workers = config?.providers.workers;
	const deploy = config?.repo?.secrets?.deploy;
	return {
		...(deployment?.cardinality === "single" ? { deployment: deployment.tuple } : {}),
		...(workers?.cardinality === "single" ? { workers: workers.tuple } : {}),
		deployKeys: (deploy?.length ?? 0) > 0,
	};
}
