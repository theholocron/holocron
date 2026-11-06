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

import { describeError, logReason, style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Notifications,
	type NotificationsLayout,
	PluginLoader,
	type Source,
} from "../../plugin/index.js";
import { notificationProviders, pickProvider, whyMissing } from "../notifications-channel-add/index.js";
import { EMPTY_LINKS, linksLocation, parseLinks } from "./links.js";
import type {
	LinksFile,
	NotificationsSyncRolesReport,
	RunNotificationsSyncRolesInput,
} from "./notifications-sync-roles.type.js";
import { roleTeamProblem } from "./plan.js";
import { syncRoles } from "./sync-roles.js";

/** The provider that can list and change who holds a role. */
export function pickRoleManager(providers: Notifications[], wanted?: string, keep = false): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.roleMembers === "function" &&
			typeof p.addRoleMember === "function" &&
			// Taking the role away is only needed when this run will do it.
			(keep || typeof p.removeRoleMember === "function"),
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
		notifications = pickRoleManager(notificationProviders(loader), input.provider, input.keep);
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
		return refuse(describeError(err), logReason(err));
	}
	if (links.links.length === 0)
		print(`  ${style.skip("no links yet: nobody can be given a role until they link their account")}`);

	const result = await syncRoles({
		notifications,
		source: source!,
		links,
		roles: roles.map((r) => ({ name: r.name, team: r.team! })),
		...(input.context.org ? { org: input.context.org } : {}),
		dryRun,
		keep: input.keep ?? false,
		print,
	});
	report.roles.push(...result.roles);
	report.failures.push(...result.failures);

	if (report.failures.length > 0) report.status = "fail";
	else if (dryRun) report.status = "dry-run";
	print("");
	print(style.header(`${result.ok} ok, ${report.failures.length} fail, ${result.skipped} skipped`));
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
