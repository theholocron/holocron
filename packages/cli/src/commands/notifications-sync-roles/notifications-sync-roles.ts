/**
 * `holocron notifications sync-roles` — make who holds a server role match a team.
 *
 * A role that declares `team` in the layout is kept equal to that team of the `source` provider (for GitHub,
 * a team in the org). A team member is matched to a server member through the links file, so only people who
 * have linked their account can be given the role; the rest are listed. The role is taken from a linked
 * person who has left the team, but never from someone nobody has linked: an empty or missing links file
 * cannot strip the role from everyone.
 *
 * Idempotent and safe to re-run. `--dry-run` previews it.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Notifications,
	type NotificationsLayout,
	PluginLoader,
	type Source,
} from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import { notificationProviders, pickProvider, whyMissing } from "../notifications-channel-add/index.js";
import { EMPTY_LINKS, type LinksFile, linksLocation, parseLinks } from "./links.js";
import type {
	NotificationsSyncRolesReport,
	RoleSyncOutcome,
	RunNotificationsSyncRolesInput,
} from "./notifications-sync-roles.type.js";
import { planRoleSync, type RoleSyncPlan, roleTeamProblem } from "./plan.js";

/** The provider that can list and change who holds a role. */
export function pickRoleManager(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.roleMembers === "function" &&
			typeof p.addRoleMember === "function" &&
			typeof p.removeRoleMember === "function",
		{ infinitive: "manage role members", gerund: "managing role members" }
	);
}

/** What a source provider needs to be able to do to feed a role sync, or the reason it cannot. */
export function sourceProblem(source: Source | undefined): string | undefined {
	if (!source) return "no `source` provider is available to read the team and the links file";
	if (!source.teamMembers) return `the \`${source.providerName}\` provider cannot list team members`;
	if (!source.readFile) return `the \`${source.providerName}\` provider cannot read the links file`;
	return undefined;
}

/** Reads the links file; a file that does not exist yet is an empty one, a damaged one throws. */
export async function readLinks(
	source: Source,
	layout: NotificationsLayout,
	org: string | undefined,
	provider: string
): Promise<LinksFile> {
	const { repo, path } = linksLocation(layout, org, provider);
	const file = await source.readFile!(path, repo);
	if (!file) return EMPTY_LINKS;
	try {
		return parseLinks(file.content);
	} catch (err) {
		throw new Error(`${repo}/${path}: ${errorMessage(err)}`, { cause: err });
	}
}

/** Reads the team, the links and the role's holders, and works out what has to change. */
export async function planForRole(args: {
	notifications: Notifications;
	source: Source;
	role: string;
	team: string;
	/** The organisation the team is in; defaults to the source's own. */
	org?: string;
	links: LinksFile;
}): Promise<RoleSyncPlan> {
	const [team, holders] = await Promise.all([
		args.source.teamMembers!(args.team, args.org),
		args.notifications.roleMembers!(args.role),
	]);
	return planRoleSync({ team, links: args.links.links, holders });
}

export async function runNotificationsSyncRoles(
	input: RunNotificationsSyncRolesInput
): Promise<NotificationsSyncRolesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications sync-roles");

	const dryRun = input.context.dryRun ?? false;
	const report: NotificationsSyncRolesReport = { status: "ok", roles: [], failures: [] };
	const refuse = (message: string, reason: string = message): NotificationsSyncRolesReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "notifications sync-roles");
		return { ...report, status: "fail", message };
	};

	let notifications: Notifications;
	try {
		notifications = pickRoleManager(notificationProviders(loader), input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	const layout = notifications.layout;
	const roles = (layout?.roles ?? []).filter((r) => r.team);
	if (!layout || roles.length === 0) {
		return refuse(
			`no role in the \`${notifications.providerName}\` layout declares a \`team\` — add \`team: "<slug>"\` to a role in holocron.config.ts`
		);
	}
	const conflict = roleTeamProblem(layout);
	if (conflict) return refuse(conflict);
	const source = loader.has("source") ? (loader.get("source") as Source) : undefined;
	const problem = sourceProblem(source);
	if (problem) return refuse(loader.has("source") ? problem : whyMissing(loader, "source", problem));

	let links: LinksFile;
	try {
		links = await readLinks(source!, layout, input.context.org, notifications.providerName);
	} catch (err) {
		return refuse(describeProviderError(err), logReason(err));
	}
	if (links.links.length === 0)
		print(`  ${style.skip("no links yet: nobody can be given a role until they link their account")}`);

	const tally = { ok: 0, skip: 0 };
	for (const role of roles) {
		print(`\n${style.header(`${role.name} ← team ${role.team}`)}`);
		const step = `role ${role.name}`;
		let plan: RoleSyncPlan;
		try {
			plan = await planForRole({
				notifications,
				source: source!,
				role: role.name,
				team: role.team!,
				...(input.context.org ? { org: input.context.org } : {}),
				links,
			});
		} catch (err) {
			const message = describeProviderError(err);
			print(`  ${style.fail(`${step}: ${message}`)}`);
			report.failures.push({ step, message });
			continue;
		}
		const outcome: RoleSyncOutcome = { role: role.name, team: role.team!, plan, added: [], removed: [] };
		report.roles.push(outcome);
		tally.skip += plan.inSync;
		if (plan.inSync > 0) print(`  ${style.skip(`${plan.inSync} already have it`)}`);

		const act = async (verb: "add" | "remove", who: { member: string; login: string }) => {
			const label = `${verb === "add" ? "gave" : "took"} ${role.name} ${verb === "add" ? "to" : "from"} ${who.login} (${who.member})`;
			if (dryRun || (verb === "remove" && input.keep)) {
				print(
					`  ${style.skip(`would ${verb === "add" ? "give" : "take"} ${role.name} ${verb === "add" ? "to" : "from"} ${who.login} (${who.member})${input.keep && verb === "remove" ? " (kept: --keep)" : ""}`)}`
				);
				tally.skip++;
				return;
			}
			try {
				// Called on the provider, not pulled off it: real providers keep their client on `this`.
				if (verb === "add") await notifications.addRoleMember!(role.name, who.member);
				else await notifications.removeRoleMember!(role.name, who.member);
				(verb === "add" ? outcome.added : outcome.removed).push(who.member);
				print(`  ${style.success(label)}`);
				tally.ok++;
			} catch (err) {
				const message = describeProviderError(err);
				print(`  ${style.fail(`${step}: ${verb} ${who.login}: ${message}`)}`);
				report.failures.push({ step: `${step} ${verb} ${who.login}`, message });
			}
		};
		for (const who of plan.add) await act("add", who);
		for (const who of plan.remove) await act("remove", who);

		for (const person of plan.unlinked) {
			print(`  ${style.skip(`${person.login} is on the team but has not linked their account`)}`);
			tally.skip++;
		}
		for (const holder of plan.unknownHolders) {
			print(
				`  ${style.skip(`${holder.name ?? holder.member} holds ${role.name} but is not linked to anyone: left alone`)}`
			);
			tally.skip++;
		}
	}

	if (report.failures.length > 0) report.status = "fail";
	else if (dryRun) report.status = "dry-run";
	print("");
	print(style.header(`${tally.ok} ok, ${report.failures.length} fail, ${tally.skip} skipped`));
	logger.info(
		{
			provider: notifications.providerName,
			roles: report.roles.length,
			failures: report.failures.length,
			status: report.status,
		},
		"notifications sync-roles"
	);
	return report;
}
