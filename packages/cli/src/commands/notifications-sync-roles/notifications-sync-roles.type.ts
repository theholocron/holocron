import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";
import type { RoleSyncPlan } from "./plan.js";

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
