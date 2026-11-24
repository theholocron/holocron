import { alertChannels } from "./alert-channels/alert-channels.js";
import { checkStatuses } from "./check-statuses/check-statuses.js";
import { checks } from "./checks/checks.js";
import { dashboards } from "./dashboards/dashboards.js";
import { heartbeats } from "./heartbeats/heartbeats.js";
import { statusPages } from "./status-pages/status-pages.js";
import { type ChecklyClientOptions, createChecklyRestClient, DEFAULT_BASE } from "./utils.js";

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
export type { Dashboard, DashboardInput, DashboardKey } from "./dashboards/dashboards.js";
export type {
	Heartbeat,
	HeartbeatInput,
	HeartbeatSettings,
	HeartbeatUnit,
	ListHeartbeatsParams,
} from "./heartbeats/heartbeats.js";
export type {
	CustomDomainVerification,
	Incident,
	IncidentComponentImpact,
	IncidentComponentImpactInput,
	IncidentImpactStatus,
	IncidentInput,
	IncidentPatch,
	IncidentSummary,
	IncidentUpdate,
	IncidentUpdateInput,
	IncidentUpdateStatus,
	StatusComponent,
	StatusComponentConfiguration,
	StatusComponentInput,
	StatusComponentType,
	StatusPage,
	StatusPageInput,
	StatusRule,
	StatusRuleComponent,
	StatusRuleImpact,
	StatusRuleInput,
} from "./status-pages/status-pages.js";
export type { ChecklyClientOptions } from "./utils.js";

/** Creates a Checkly client with `alertChannels`, `checkStatuses`, `checks`, `dashboards` and `statusPages` groups. */
export function createChecklyClient(opts: ChecklyClientOptions) {
	const rest = createChecklyRestClient(opts);
	// The status page API is Checkly's v3: the same host and headers, a different version segment.
	const v3 = createChecklyRestClient({ ...opts, baseUrl: (opts.baseUrl ?? DEFAULT_BASE).replace(/\/v1\/?$/, "/v3") });
	return {
		alertChannels: alertChannels(rest),
		checkStatuses: checkStatuses(rest),
		checks: checks(rest),
		dashboards: dashboards(rest),
		statusPages: statusPages(v3),
		heartbeats: heartbeats(rest),
	};
}

/** The client `createChecklyClient` returns. */
export type ChecklyClient = ReturnType<typeof createChecklyClient>;
