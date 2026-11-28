import type { RoleNotifications, RoleSource } from "../load-role-sync-providers/index.js";

export interface SyncTeamRolesInput {
	notifications: RoleNotifications;
	source: RoleSource;
	/** The org the teams are in. */
	org: string;
	/** Only the roles that follow this team; every role that follows a team when left out. */
	team?: string;
}

/**
 * What a role sync did. `skipped` is a normal state (nothing to do or not set up); `fail` is a sync that ran and
 * could not finish, which the caller reports.
 */
export type SyncTeamRolesResult =
	| { status: "skipped"; reason: string }
	| { status: "fail"; reason: string }
	| { status: "synced" | "partial"; roles: string[]; added: number; removed: number; failures: string[] };
