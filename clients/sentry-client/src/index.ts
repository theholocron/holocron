import { auth } from "./auth/auth.js";
import { projects } from "./projects/projects.js";
import { sentryApps } from "./sentry-apps/sentry-apps.js";
import { createSentryRestClient, type SentryClientOptions } from "./utils.js";
import { workflows } from "./workflows/workflows.js";

export type { SentryOrganization } from "./auth/auth.js";
export type { CreateSentryProjectInput, SentryKey, SentryKeyDsn, SentryProject } from "./projects/projects.js";
export type { SentryApp, SentryAppInput, SentryAppInstallation } from "./sentry-apps/sentry-apps.js";
export type { SentryClientOptions } from "./utils.js";
export type {
	SentryDetector,
	SentryWorkflow,
	SentryWorkflowAction,
	SentryWorkflowActionFilter,
	SentryWorkflowCondition,
	SentryWorkflowInput,
} from "./workflows/workflows.js";

export function createSentryClient(opts: SentryClientOptions) {
	const rest = createSentryRestClient(opts);
	return {
		auth: auth(rest),
		projects: projects(rest),
		sentryApps: sentryApps(rest),
		workflows: workflows(rest),
	};
}

export type SentryClient = ReturnType<typeof createSentryClient>;
