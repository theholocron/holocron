import { alertChannels } from "./alert-channels/alert-channels.js";
import { checks } from "./checks/checks.js";
import { type ChecklyClientOptions, createChecklyRestClient } from "./utils.js";

export type {
	AlertChannel,
	AlertChannelInput,
	AlertChannelSubscription,
	AlertChannelType,
	WebhookConfig,
	WebhookKeyValue,
	WebhookMethod,
	WebhookType,
} from "./alert-channels/alert-channels.js";
export { DISCORD_TEMPLATE } from "./alert-channels/alert-channels.js";
export type {
	ApiCheck,
	ApiCheckInput,
	ApiCheckRequest,
	Assertion,
	AssertionComparison,
	AssertionSource,
	HttpMethod,
	ListChecksParams,
} from "./checks/checks.js";
export type { ChecklyClientOptions } from "./utils.js";

export function createChecklyClient(opts: ChecklyClientOptions) {
	const rest = createChecklyRestClient(opts);
	return {
		alertChannels: alertChannels(rest),
		checks: checks(rest),
	};
}

export type ChecklyClient = ReturnType<typeof createChecklyClient>;
