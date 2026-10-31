import { alertChannels } from "./alert-channels/alert-channels.js";
import { checkStatuses } from "./check-statuses/check-statuses.js";
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
export type { CheckStatus } from "./check-statuses/check-statuses.js";
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

/** Creates a Checkly client with `alertChannels`, `checkStatuses` and `checks` groups sharing one REST client. */
export function createChecklyClient(opts: ChecklyClientOptions) {
	const rest = createChecklyRestClient(opts);
	return {
		alertChannels: alertChannels(rest),
		checkStatuses: checkStatuses(rest),
		checks: checks(rest),
	};
}

/** The client `createChecklyClient` returns. */
export type ChecklyClient = ReturnType<typeof createChecklyClient>;
