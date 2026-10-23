import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope } from "../../plugin/index.js";

/** `planned` is a feature that is not built yet: it fails until it is, so the command stays red until the last one lands. */
export type VerifyStatus = "pass" | "fail" | "planned";

export interface VerifyCheck {
	id: string;
	title: string;
	status: VerifyStatus;
	/** One line: what was found, or why it failed. */
	detail: string;
	/** For a failing check, one line per thing that is wrong. */
	problems: string[];
	/** The step number in holocron#1098, for a feature that is not built yet. */
	step?: number;
}

export interface RunNotificationsVerifyInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Where the layout's secrets live. Defaults to the org (`context.org`). */
	scope?: SecretScope;
	/** Which `notifications` provider, when several can inspect. */
	provider?: string;
	/** Report only the checks that exist; leave out the not-built ones (for use as a routine drift check). */
	builtOnly?: boolean;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

export interface NotificationsVerifyReport {
	status: "ok" | "fail";
	checks: VerifyCheck[];
	summary: { pass: number; fail: number; planned: number };
	/** Set when verification could not run at all (no provider, no layout). */
	message?: string;
}
