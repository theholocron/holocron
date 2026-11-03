import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { Notifications, PluginLoader, RuntimeContext, Source, SourceTeamMember } from "../../plugin/index.js";
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

/** One person: their GitHub account and their member id on the notifications provider. */
export interface MemberLink {
	/** The GitHub user id, as a string. It survives a rename; the login does not. */
	github: string;
	/** The GitHub login when the link was made; for reports only. */
	login: string;
	/** The member's id on the notifications provider (for Discord, the user id). */
	member: string;
}

/** The file that says which server member is which GitHub account. */
export interface LinksFile {
	/** The file format version. */
	version: 1;
	/** One entry per linked person. */
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

/** What {@link syncRoles} needs: the providers, the links, and the roles to keep equal to their teams. */
export interface SyncRolesInput {
	/** The provider that lists and changes who holds a role. */
	notifications: Notifications;
	/** The provider that lists a team's members. */
	source: Source;
	/** Who is which person, from the links file. */
	links: LinksFile;
	/** Each role and the team it follows. */
	roles: ReadonlyArray<{ name: string; team: string }>;
	/** The organisation the teams are in; defaults to the source's own. */
	org?: string;
	/** Report what would change without changing anything. */
	dryRun?: boolean;
	/** Give the role to new team members but do not take it from people who left. */
	keep?: boolean;
	/** Where progress lines go; nowhere when left out. */
	print?: (line: string) => void;
}

/** What {@link syncRoles} did. */
export interface SyncRolesResult {
	/** One entry per role whose plan could be made. */
	roles: RoleSyncOutcome[];
	/** Steps that failed; the run carried on past each. */
	failures: Array<{ step: string; message: string }>;
	/** Roles given or taken. */
	ok: number;
	/** Already in sync, left alone, or only previewed. */
	skipped: number;
}
