import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { DuplicateDiscussion, PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";

export interface RunNotificationsDedupeInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** The forum to repair. Defaults to the layout's one forum with `feeds.prs`. */
	channel?: string;
	/** Which `notifications` provider, when several can de-duplicate posts. */
	provider?: string;
	/** Delete without asking. */
	yes?: boolean;
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
}

export interface NotificationsDedupeReport {
	/** `fail` if a key could not be repaired or the run could not start, `cancelled` when the person said no. */
	status: "ok" | "fail" | "dry-run" | "cancelled";
	/** The forum the run read, when it got that far. */
	channel?: string;
	/** Every key found with more than one post. */
	duplicates: DuplicateDiscussion[];
	/** Posts deleted (none on a dry run). */
	deleted: number;
	failures: Array<{ key: string; message: string }>;
	message?: string;
}
