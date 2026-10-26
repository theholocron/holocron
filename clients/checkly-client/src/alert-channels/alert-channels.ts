import type { RestClient } from "../utils.js";

export type AlertChannelType = "EMAIL" | "SLACK" | "SLACK_APP" | "WEBHOOK" | "SMS" | "PAGERDUTY" | "OPSGENIE" | "CALL";

export type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

/**
 * Which service a webhook channel is formatted for. Checkly stores a Discord channel as a plain `WEBHOOK` with this
 * marker and a body template; there is no separate Discord type.
 */
export type WebhookType =
	"WEBHOOK_DISCORD" | "WEBHOOK_MSTEAMS" | "WEBHOOK_TELEGRAM" | "WEBHOOK_GITHUB" | "WEBHOOK_SPIKE";

export interface WebhookKeyValue {
	key: string;
	value: string;
	locked?: boolean;
}

/** The `config` of a `WEBHOOK` channel, as Checkly returns it. */
export interface WebhookConfig {
	name: string;
	/** Where Checkly posts. For Discord this is a webhook URL and is a secret: anyone holding it can post to the channel. */
	url: string;
	method: WebhookMethod;
	/** Handlebars body template with Checkly's `{{VARIABLES}}`. */
	template?: string;
	headers?: WebhookKeyValue[];
	queryParameters?: WebhookKeyValue[];
	webhookType?: WebhookType;
	webhookSecret?: string;
}

/** A subscription targets exactly one check or one check group. */
export type AlertChannelSubscription = { id?: number; activated: boolean } & (
	{ checkId: string; groupId?: null } | { groupId: number; checkId?: null }
);

interface AlertChannelSettings {
	sendRecovery?: boolean;
	sendFailure?: boolean;
	sendDegraded?: boolean;
	sslExpiry?: boolean;
	sslExpiryThreshold?: number;
	/** Subscribe checks created later in the UI. Checks made through the API or CLI are never auto-subscribed. */
	autoSubscribe?: boolean;
	/**
	 * The full list of subscribed checks. Checkly's update replaces the whole channel, so anything left out here (or
	 * in the settings above) is dropped: send the complete channel, not just what changed.
	 */
	subscriptions?: AlertChannelSubscription[];
}

/** What a channel is made of. A webhook's `config` is checked; the other types are passed through as Checkly defines them. */
export type AlertChannelInput = AlertChannelSettings &
	(
		| { type: "WEBHOOK"; config: WebhookConfig }
		| {
				type: Exclude<AlertChannelType, "WEBHOOK">;
				config: Record<string, unknown>;
		  }
	);

interface AlertChannelRecord {
	id: number;
	sendRecovery: boolean;
	sendFailure: boolean;
	sendDegraded: boolean;
	sslExpiry: boolean;
	sslExpiryThreshold: number;
	autoSubscribe: boolean;
	subscriptions: AlertChannelSubscription[];
	created_at: string;
	updated_at: string | null;
}

export type AlertChannel = AlertChannelRecord &
	(
		| { type: "WEBHOOK"; config: WebhookConfig }
		| {
				type: Exclude<AlertChannelType, "WEBHOOK">;
				config: Record<string, unknown>;
		  }
	);

/**
 * The message body of Checkly's own Discord setup (its AI-analysis section left out, since not every account has it), so
 * a channel made through the API reads like one made in the UI.
 */
export const DISCORD_TEMPLATE = `{
  "content": null,
  "username": "Checkly",
  "avatar_url": "https://s3.eu-central-1.amazonaws.com/cdn.checklyhq.com/slack/checkly-slack-icon.png",
  {{! Embeds for the SSL expiry notifications}}
  {{#eq ALERT_TYPE "ALERT_SSL" }}
  "embeds": [
    {
      "title": "{{ALERT_TITLE}}",
      "url": "{{RESULT_LINK}}",
      "color": 16762924
    }
  ]
  {{else}}
  {{! Embeds for the standard failure, recovery and degraded notifications}}
  "embeds": [
    {
      "title": "{{ALERT_TITLE}}",
      "url": "{{RESULT_LINK}}",
      "fields": [
        {{#eq ALERT_TYPE "API" }}
        {
          "name": "Status code",
          "value": "{{API_CHECK_RESPONSE_STATUS_CODE}}"
        },
        {{/eq}}
        {{#if GROUP_NAME}}
        {
          "name": "Group",
          "value": "{{GROUP_NAME}}"
        },
        {{/if}}
        {
          "name": "Response Time",
          "value": "{{RESPONSE_TIME}}ms"
        },
        {
          "name": "Location",
          "value": "{{RUN_LOCATION}}"
        },
        {
          "name": "Tags",
          "value": "[{{#each TAGS}} {{this}} {{#unless @last}},{{/unless}} {{/each}}]"
        }
      ],
      "timestamp": "{{STARTED_AT}}"
    }
  ]
  {{/eq}}
}
`;

/** Checkly's page size ceiling for this listing. */
const PAGE = 100;
/** A guard so a runaway listing cannot loop forever. */
const MAX_PAGES = 50;

export function alertChannels(rest: RestClient) {
	return {
		/** Every alert channel on the account, read page by page. */
		list: async (): Promise<AlertChannel[]> => {
			const read = (page: number) =>
				rest.request<AlertChannel[]>("/alert-channels", {
					query: { limit: String(PAGE), page: String(page) },
				});
			const all: AlertChannel[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const batch = await read(page);
				all.push(...batch);
				if (batch.length < PAGE) return all;
			}
			// Exactly MAX_PAGES full pages: only a further, non-empty page means there are too many.
			if ((await read(MAX_PAGES + 1)).length > 0) {
				throw new Error(`more than ${MAX_PAGES * PAGE} alert channels; refusing to read them all`);
			}
			return all;
		},

		/** One alert channel. Throws ProviderApiError 404 if there is none. */
		get: (id: number): Promise<AlertChannel> => rest.request<AlertChannel>(`/alert-channels/${id}`),

		create: (input: AlertChannelInput): Promise<AlertChannel> =>
			rest.request<AlertChannel>("/alert-channels", {
				method: "POST",
				body: { ...input },
			}),

		/**
		 * Replace a channel. Checkly's update takes the whole channel, so send every setting and subscription you want
		 * to keep; there is no version check, so callers must not update the same channel concurrently.
		 */
		update: (id: number, input: AlertChannelInput): Promise<AlertChannel> =>
			rest.request<AlertChannel>(`/alert-channels/${id}`, {
				method: "PUT",
				body: { ...input },
			}),

		delete: (id: number): Promise<void> => rest.request<void>(`/alert-channels/${id}`, { method: "DELETE" }),
	};
}
