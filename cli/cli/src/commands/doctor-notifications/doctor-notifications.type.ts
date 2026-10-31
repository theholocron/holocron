import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope } from "../../plugin/index.js";

export type NotificationsCheckStatus = "pass" | "fail" | "skip";

export interface NotificationsCheck {
	id: string;
	title: string;
	status: NotificationsCheckStatus;
	/** One line: what was found, or why it failed or was skipped. */
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
	/**
	 * Post a labelled test message through every channel that declares a webhook and remove each one again.
	 * Without it, a full run leaves one test post in the layout's `testChannel`, and `builtOnly` posts nothing.
	 */
	deliver?: boolean;
	/** Test seam for the requests to the hosted sign-in service and to the relay Worker. */
	fetch?: typeof fetch;
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
