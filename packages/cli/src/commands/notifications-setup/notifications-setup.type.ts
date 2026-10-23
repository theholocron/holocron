import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope } from "../../plugin/index.js";
import type { ChannelOutcome, NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";

export interface RunNotificationsSetupInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Where webhook secrets live. Defaults to the org (`context.org`). */
	scope?: SecretScope;
	/** Which `notifications` provider, when several can provision. */
	provider?: string;
	loader?: PluginLoader;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
}

export interface RoleOutcome {
	name: string;
	/** Not a secret; needed e.g. to ping the role from a workflow. */
	id?: string;
	created: boolean;
	/** The secret the id was stored in, when the layout asked for one. */
	secret?: string;
	stored?: boolean;
}

export interface NotificationsSetupReport {
	status: "ok" | "fail" | "dry-run";
	categories: string[];
	channels: ChannelOutcome[];
	roles: RoleOutcome[];
	/** One entry per step that threw; the run continues past them. */
	failures: Array<{ step: string; message: string }>;
	message?: string;
}
