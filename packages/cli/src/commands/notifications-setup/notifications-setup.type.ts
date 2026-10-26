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
	/** The loader has already loaded its providers (a caller that built on them): do not load, and replace, them again. */
	preloaded?: boolean;
	/** Reads a webhook avatar as a `data:` URI. Defaults to {@link loadAvatar}; tests pass their own. */
	loadAvatar?: (source: string) => Promise<string>;
	/**
	 * Waits for a person to press Enter, for a step that needs a permission given for one edit and taken away
	 * afterwards. Defaults to a prompt when a terminal is attached, and to nothing (the step fails with the
	 * explanation) when not. `false` never prompts, whatever the terminal.
	 */
	pause?: ((message: string) => Promise<void>) | false;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
}

export interface RoleOutcome {
	name: string;
	/** Not a secret; needed e.g. to ping the role from a workflow. */
	id?: string;
	created: boolean;
	/** Settings of an existing role that disagreed with the layout and were changed. */
	updated?: string[];
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
