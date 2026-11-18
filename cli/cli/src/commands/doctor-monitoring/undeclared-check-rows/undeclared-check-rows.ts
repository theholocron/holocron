/**
 * The `monitoring-undeclared` row of `doctor monitoring`: the account's checks that carry a tag some declared dashboard
 * or status page component picks checks by, and that no config declares (the root's or a workspace package's, a check
 * name being its identity). Such a check is counted in that component's status and nothing in the repo says it exists.
 * An `info` row (shown as skipped): a hand-made check is sometimes right. A check with none of those tags is not
 * reported, since the account's other checks stay its own business, and nor are heartbeats. A package whose config
 * could not be read makes the row a skip that names it, because the check may be declared there. No row when nothing
 * declares a tag to look for, or when the checks could not be listed (the checks row says why).
 */
import type { CheckRow } from "@theholocron/kyber/ui";

import type { UndeclaredCheckRowsInput } from "./undeclared-check-rows.type.js";

const ID = "monitoring-undeclared";
const TITLE = "checks no config declares";

export function undeclaredCheckRows({ monitoring, workspace, have }: UndeclaredCheckRowsInput): CheckRow[] {
	if (have === undefined) return [];
	const tags = new Set(
		[
			...(monitoring.dashboards ?? []),
			...workspace.dashboards,
			...[...(monitoring.statusPages ?? []), ...workspace.statusPages].flatMap((p) => p.components),
		].flatMap((x) => x.tags)
	);
	if (tags.size === 0) return [];
	const row = (status: CheckRow["status"], detail: string): CheckRow[] => [
		{ id: ID, title: TITLE, status, detail, problems: [] },
	];
	if (workspace.unreadable.length > 0) {
		return row(
			"skip",
			`info: not compared, a package's config could not be read: ${workspace.unreadable.join("; ")}`
		);
	}
	const declared = new Set([...monitoring.checks, ...workspace.checks].map((c) => c.name));
	const picked = have
		.map((c) => ({ name: c.name, tags: c.tags ?? [] }))
		.filter((c) => c.tags.some((t) => tags.has(t)));
	const undeclared = picked.filter((c) => !declared.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
	if (undeclared.length === 0) return row("ok", `${picked.length} compared, all declared`);
	const shown = undeclared.map((c) => `${c.name} (${[...c.tags].sort().join(", ")})`);
	return row(
		"skip",
		`info: ${undeclared.length} check(s) a declared dashboard or component picks up, declared nowhere: ${shown.join(", ")}`
	);
}
