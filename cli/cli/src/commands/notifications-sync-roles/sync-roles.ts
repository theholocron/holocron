import type { Notifications, Source } from "../../plugin/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import type {
	RoleSyncOutcome,
	RoleSyncPlan,
	SyncRolesInput,
	SyncRolesResult,
} from "./notifications-sync-roles.type.js";
import { planRoleSync } from "./plan.js";

/** Reads the team and the role's holders and works out what has to change. */
export async function planForRole(args: {
	notifications: Notifications;
	source: Source;
	role: string;
	team: string;
	/** The organisation the team is in; defaults to the source's own. */
	org?: string;
	links: SyncRolesInput["links"];
}): Promise<RoleSyncPlan> {
	const [team, holders] = await Promise.all([
		args.source.teamMembers!(args.team, args.org),
		args.notifications.roleMembers!(args.role),
	]);
	return planRoleSync({ team, links: args.links.links, holders });
}

/**
 * Makes each role's holders equal its team, one role after another. This is the sync itself, with no setup in
 * front of it: the caller has already picked the providers, read the links and checked the layout. `holocron
 * notifications sync-roles` and Sentinel's role sync are two callers of it. A step that fails is recorded and the
 * run goes on; nothing here throws for a provider error. Idempotent: a role that already matches changes nothing.
 * Lines go to `input.print` when it is given, and nowhere otherwise.
 */
export async function syncRoles(input: SyncRolesInput): Promise<SyncRolesResult> {
	const print = input.print ?? (() => {});
	const { notifications, source, links, dryRun, keep } = input;
	const result: SyncRolesResult = { roles: [], failures: [], ok: 0, skipped: 0 };

	for (const role of input.roles) {
		print(`\n${style.header(`${role.name} ← team ${role.team}`)}`);
		const step = `role ${role.name}`;
		let plan: RoleSyncPlan;
		try {
			plan = await planForRole({
				notifications,
				source,
				role: role.name,
				team: role.team,
				...(input.org ? { org: input.org } : {}),
				links,
			});
		} catch (err) {
			const message = describeProviderError(err);
			print(`  ${style.fail(`${step}: ${message}`)}`);
			result.failures.push({ step, message });
			continue;
		}
		const outcome: RoleSyncOutcome = { role: role.name, team: role.team, plan, added: [], removed: [] };
		result.roles.push(outcome);
		result.skipped += plan.inSync;
		if (plan.inSync > 0) print(`  ${style.skip(`${plan.inSync} already have it`)}`);

		const act = async (verb: "add" | "remove", who: { member: string; login: string }) => {
			const label = `${verb === "add" ? "gave" : "took"} ${role.name} ${verb === "add" ? "to" : "from"} ${who.login} (${who.member})`;
			if (dryRun || (verb === "remove" && keep)) {
				print(
					`  ${style.skip(`would ${verb === "add" ? "give" : "take"} ${role.name} ${verb === "add" ? "to" : "from"} ${who.login} (${who.member})${keep && verb === "remove" ? " (kept: --keep)" : ""}`)}`
				);
				result.skipped++;
				return;
			}
			try {
				// Called on the provider, not pulled off it: real providers keep their client on `this`.
				if (verb === "add") await notifications.addRoleMember!(role.name, who.member);
				else await notifications.removeRoleMember!(role.name, who.member);
				(verb === "add" ? outcome.added : outcome.removed).push(who.member);
				print(`  ${style.success(label)}`);
				result.ok++;
			} catch (err) {
				const message = describeProviderError(err);
				print(`  ${style.fail(`${step}: ${verb} ${who.login}: ${message}`)}`);
				result.failures.push({ step: `${step} ${verb} ${who.login}`, message });
			}
		};
		for (const who of plan.add) await act("add", who);
		for (const who of plan.remove) await act("remove", who);

		for (const person of plan.unlinked) {
			print(`  ${style.skip(`${person.login} is on the team but has not linked their account`)}`);
			result.skipped++;
		}
		for (const holder of plan.unknownHolders) {
			print(
				`  ${style.skip(`${holder.name ?? holder.member} holds ${role.name} but is not linked to anyone: left alone`)}`
			);
			result.skipped++;
		}
	}
	return result;
}
