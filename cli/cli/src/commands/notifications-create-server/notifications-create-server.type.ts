import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";
import type { NotificationsSetupReport, RunNotificationsSetupInput } from "../notifications-setup/index.js";

export interface RunNotificationsCreateServerInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** What the new server is called. Not needed with `resume`. */
	name?: string;
	/** The member who will own it: they must join through the invite, and the bot then hands it over. */
	owner: string;
	/** Which `notifications` provider, when several can create a server. */
	provider?: string;
	/** Create another server even though the config already names one, and replace its id. */
	force?: boolean;
	/** The server already exists (an earlier run stopped at the invite): skip creating and applying, and finish the hand-over. */
	resume?: boolean;
	loader?: PluginLoader;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
	/** How long to wait for the owner to join, in milliseconds. Defaults to 15 minutes. */
	waitMs?: number;
	/** How often to look, in milliseconds. Defaults to 5 seconds. */
	pollMs?: number;
	/** Test seams. */
	sleep?: (ms: number) => Promise<void>;
	runSetup?: (input: RunNotificationsSetupInput) => Promise<NotificationsSetupReport>;
}

export interface NotificationsCreateServerReport {
	status: "ok" | "fail" | "dry-run";
	serverId?: string;
	invite?: string;
	/** Whether the new server id was written into the config file. */
	configUpdated?: boolean;
	message?: string;
}

/** What {@link writeGuildId} did to the config file. */
export type GuildIdWrite = { written: true } | { written: false; reason: string };
