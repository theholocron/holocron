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
	/**
	 * Make the layout's server emoji again from their images even when the server has them (`--replace`). Only emoji the
	 * layout gives an `image` are touched. Asks first unless `yes` or a dry run; the old emoji and its reactions are lost.
	 */
	replaceEmoji?: boolean;
	/** Replace without asking (`--yes`; required without a terminal). */
	yes?: boolean;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	loader?: PluginLoader;
	/** The loader has already loaded its providers (a caller that built on them): do not load, and replace, them again. */
	preloaded?: boolean;
	/** Reads a webhook avatar as a `data:` URI. Defaults to {@link loadAvatar}; tests pass their own. */
	loadAvatar?: (source: string) => Promise<string>;
	/** Reads the picture a server emoji is made from as a `data:` URI. Defaults to `loadEmojiImage`; tests pass their own. */
	loadEmojiImage?: (source: string) => Promise<string>;
	/** Reads the built relay Worker. Defaults to the file system; tests pass their own. */
	readRelayCode?: (path: string) => Promise<string>;
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
	/** `cancelled` when the person said no to replacing emoji; nothing was written. */
	status: "ok" | "fail" | "dry-run" | "cancelled";
	categories: string[];
	channels: ChannelOutcome[];
	roles: RoleOutcome[];
	/** The server emoji the layout gives an image, and whether each was made now. Absent when it gives none. */
	emojis?: Array<{ name: string; created: boolean; replaced?: boolean }>;
	/** One entry per step that threw; the run continues past them. */
	failures: Array<{ step: string; message: string }>;
	message?: string;
}
