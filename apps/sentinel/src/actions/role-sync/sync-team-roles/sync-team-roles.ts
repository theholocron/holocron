/**
 * Keeps server roles equal to their GitHub teams, for one delivery (holocron#1595).
 *
 * The CLI's `holocron sync roles` and this are two adapters over one function: the checks and the
 * sync are `roleTeamProblem`, `sourceProblem`, `readLinks` and `syncRoles` from `@theholocron/cli`, so what
 * counts as in sync, who is never removed (a holder nobody linked) and how a failure is recorded cannot differ
 * between them. What is Sentinel's own is which roles a delivery concerns, and reporting a result instead of
 * printing it. Idempotent, so a redelivered or overlapping webhook changes nothing the first did not.
 */

import { readLinks, roleTeamProblem, sourceProblem, syncRoles } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import type { SyncTeamRolesInput, SyncTeamRolesResult } from "./sync-team-roles.type.js";

export async function syncTeamRoles(input: SyncTeamRolesInput): Promise<SyncTeamRolesResult> {
	const { notifications, source, org } = input;
	if (
		typeof notifications.roleMembers !== "function" ||
		typeof notifications.addRoleMember !== "function" ||
		typeof notifications.removeRoleMember !== "function"
	) {
		return { status: "skipped", reason: `the ${notifications.providerName} provider cannot manage role members` };
	}
	const layout = notifications.layout;
	const followers = (layout?.roles ?? []).filter(
		(r) => r.team && (input.team === undefined || r.team.toLowerCase() === input.team.toLowerCase())
	);
	if (!layout || followers.length === 0) {
		return {
			status: "skipped",
			reason: input.team ? `no role follows the ${input.team} team` : "no role declares a team",
		};
	}
	const conflict = roleTeamProblem(layout);
	if (conflict) return { status: "fail", reason: conflict };
	const problem = sourceProblem(source);
	if (problem) return { status: "fail", reason: problem };

	let links;
	try {
		links = await readLinks(source, layout, org, notifications.providerName);
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}

	const result = await syncRoles({
		notifications,
		source,
		links,
		roles: followers.map((r) => ({ name: r.name, team: r.team! })),
		org,
	});
	return {
		status: result.failures.length > 0 ? "partial" : "synced",
		roles: result.roles.map((r) => r.role),
		added: result.roles.reduce((n, r) => n + r.added.length, 0),
		removed: result.roles.reduce((n, r) => n + r.removed.length, 0),
		failures: result.failures.map((f) => `${f.step}: ${f.message}`),
	};
}
