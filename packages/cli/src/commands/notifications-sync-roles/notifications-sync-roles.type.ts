import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SourceTeamMember } from "../../plugin/index.js";
import type { NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";

export interface RunNotificationsSyncRolesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Which `notifications` provider, when several can manage roles. */
	provider?: string;
	/** Report what would change without taking the role from anyone; people are still given it. */
	keep?: boolean;
	loader?: PluginLoader;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
}

export interface RoleSyncOutcome {
	role: string;
	team: string;
	plan: RoleSyncPlan;
	/** Members the role was given to (empty on a dry run). */
	added: string[];
	/** Members the role was taken from (empty on a dry run or with `keep`). */
	removed: string[];
}

export interface NotificationsSyncRolesReport {
	status: "ok" | "fail" | "dry-run";
	roles: RoleSyncOutcome[];
	failures: Array<{ step: string; message: string }>;
	message?: string;
}

export interface MemberLink {
	/** The GitHub user id, as a string. It survives a rename; the login does not. */
	github: string;
	/** The GitHub login when the link was made; for reports only. */
	login: string;
	/** The member's id on the notifications provider (for Discord, the user id). */
	member: string;
}

export interface LinksFile {
	version: 1;
	links: MemberLink[];
}

export interface RoleSyncPlan {
	/** Team members who are linked and do not hold the role: give it to them. */
	add: Array<{ member: string; login: string }>;
	/** Holders linked to a GitHub account that is no longer on the team: take it away. */
	remove: Array<{ member: string; login: string }>;
	/** Team members with no link: the role cannot reach them until they link their account. */
	unlinked: SourceTeamMember[];
	/** Holders with no link at all. Left alone, because nothing says they should not have it. */
	unknownHolders: Array<{ member: string; name?: string }>;
	/** Linked team members who already hold the role. */
	inSync: number;
}
