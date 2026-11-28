import type { GitHubAppCredentials, GitHubAppDelivery, ListAppDeliveriesOptions } from "@theholocron/github-client";
import type { CheckRow, CheckStatus } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** The two calls `redeliver webhooks` makes to the App's delivery log, so a test supplies them without a network. */
export interface DeliveryApi {
	/** `GET /app/hook/deliveries` with the App's own JWT. */
	listAppDeliveries(creds: GitHubAppCredentials, opts?: ListAppDeliveriesOptions): Promise<GitHubAppDelivery[]>;
	/** `POST /app/hook/deliveries/{id}/attempts` with the App's own JWT. */
	redeliverAppDelivery(creds: GitHubAppCredentials, deliveryId: number): Promise<void>;
}

/** What `holocron redeliver webhooks` needs to run. */
export interface RunRedeliverWebhooksInput {
	/** The loaded config: `githubApps` and the `vault` provider. */
	loaded: LoadedConfig;
	/** The runtime context (`--dry-run`, tokens). */
	context: RuntimeContext;
	/** How far back to look: a span (`30m`, `12h`, `7d`) or a date; default `1d`. */
	since?: string;
	/** Only this `githubApps` instance, by name. */
	app?: string;
	/** Redeliver without asking; required without a terminal, unless `--dry-run`. */
	yes?: boolean;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** The calls to the delivery log. Defaults to the GitHub client's. */
	api?: DeliveryApi;
	/** Where the rows go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. */
	logger?: Logger;
	/** The clock, in epoch milliseconds; `Date.now` by default. */
	now?: () => number;
	/** Whether a terminal is there to ask; defaults to `process.stdin.isTTY`. */
	interactive?: boolean;
	/** Asks the one question; defaults to the terminal prompt. */
	confirm?: (message: string) => Promise<boolean>;
}

/** How a `redeliver webhooks` run ended. */
export interface RedeliverWebhooksReport {
	/** `fail` when an instance could not be read or a redelivery was refused; otherwise `ok`. */
	status: CheckStatus;
	/** One row per instance problem and per delivery. */
	rows: CheckRow[];
}
