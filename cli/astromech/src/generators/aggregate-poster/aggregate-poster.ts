import type { CiAggregatePoster, TasksConfig } from "../../config/schema/index.js";

/**
 * Who posts the `ci / Required checks` check for a manifest: `"sentinel"` or `"none"` only when `ci.aggregate` says
 * exactly that, otherwise `"actions"`. A misspelling therefore keeps the poster that exists today (the config loader rejects it with
 * an error where it can, so this is the quiet fallback, not the validation), and a manifest with no `ci` block, which
 * is every repo today, is unchanged.
 */
export function aggregatePoster(config: Pick<TasksConfig, "ci">): CiAggregatePoster {
	const setting = config.ci?.aggregate;
	return setting === "sentinel" || setting === "none" ? setting : "actions";
}
