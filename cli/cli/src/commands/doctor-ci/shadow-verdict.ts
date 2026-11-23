import type { SourceCheckRun } from "../../plugin/index.js";
import type { ShadowVerdict } from "./shadow.type.js";

/**
 * The verdict of the newest run named `name` among a commit's check runs: still running is `pending`, a completed
 * `success` is `success` and any other completed result is `failure`. The newest is the one with the latest start and,
 * on a tie, the higher id, the rule the aggregate itself follows. `undefined` when nothing posted under the name.
 */
export function shadowVerdict(runs: readonly SourceCheckRun[], name: string): ShadowVerdict | undefined {
	const newest = runs
		.filter((run) => run.name === name)
		.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "") || Number(b.id) - Number(a.id))[0];
	if (newest === undefined) return undefined;
	if (newest.status !== "completed") return "pending";
	return newest.conclusion === "success" ? "success" : "failure";
}
