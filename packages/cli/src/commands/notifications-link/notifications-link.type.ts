import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { NotificationsChannelAddPrint } from "../notifications-channel-add/index.js";

export interface RunNotificationsLinkInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	provider?: string;
	loader?: PluginLoader;
	print?: NotificationsChannelAddPrint;
	logger?: Logger;
	/** Test seams. */
	fetch?: typeof fetch;
	/** Waits for the browser to come back; defaults to a one-shot local listener. Receives the redirect URI's port. */
	waitForCode?: (input: { port: number; state: string; onListening: () => void }) => Promise<string>;
	/** Opens the sign-in page; defaults to the system browser. A failure is not fatal, the URL is printed. */
	openBrowser?: (url: string) => Promise<void>;
	/** Makes the `state`; defaults to 16 random bytes. */
	newState?: () => string;
}

export interface NotificationsLinkReport {
	status: "ok" | "fail" | "dry-run";
	/** How the sign-in came back: this machine, or the hosted service. */
	via?: "local" | "hosted";
	linked?: { github: string; login: string; member: string; changed: boolean };
	message?: string;
}

export type CallbackChoice =
	{ kind: "hosted"; redirectUri: string; reason: string } | { kind: "local"; redirectUri: string; reason: string };
