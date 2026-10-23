import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope } from "../../plugin/index.js";

export type NotificationsCheckStatus = "pass" | "fail";

export interface NotificationsCheck {
	id: string;
	title: string;
	status: NotificationsCheckStatus;
	/** One line: what was found, or why it failed. */
	detail: string;
	/** For a failing check, one line per thing that is wrong. */
	problems: string[];
	/** The step number in holocron#1098, for a feature that is not built yet (it fails until it lands). */
	step?: number;
}

export interface RunDoctorNotificationsInput {
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

export interface DoctorNotificationsReport {
	status: "ok" | "fail";
	checks: NotificationsCheck[];
	summary: { pass: number; fail: number; skip: number };
	/** Set when verification could not run at all (no provider, no layout). */
	message?: string;
}
