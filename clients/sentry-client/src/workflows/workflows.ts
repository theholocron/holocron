import type { RestClient } from "../utils.js";

export interface SentryWorkflowCondition {
	type: string;
	comparison: unknown;
	conditionResult: unknown;
}

export interface SentryWorkflowAction {
	type: string;
	config: Record<string, unknown>;
	data: Record<string, unknown>;
}

export interface SentryWorkflowActionFilter {
	logicType: string;
	conditions: SentryWorkflowCondition[];
	actions: SentryWorkflowAction[];
}

/** What a workflow (an alert rule in Sentry's Monitors → Alerts) is made of, as sent when creating or updating one. */
export interface SentryWorkflowInput {
	name: string;
	enabled: boolean;
	environment: string | null;
	/** `frequency` is minutes between notifications for one issue. */
	config: { frequency: number };
	/** The detectors it is attached to; an issue stream detector per project covers that project's issues. */
	detectorIds: string[];
	triggers: { logicType: string; conditions: SentryWorkflowCondition[] };
	actionFilters: SentryWorkflowActionFilter[];
}

/** A condition or action as a read returns it: the same shape, with the id Sentry gave it. */
export type SentryWorkflowConditionRead = SentryWorkflowCondition & {
	id?: string;
};
export type SentryWorkflowActionRead = SentryWorkflowAction & { id?: string };

export interface SentryWorkflow extends SentryWorkflowInput {
	id: string;
	triggers: {
		id?: string;
		logicType: string;
		conditions: SentryWorkflowConditionRead[];
	};
	actionFilters: Array<{
		id?: string;
		logicType: string;
		conditions: SentryWorkflowConditionRead[];
		actions: SentryWorkflowActionRead[];
	}>;
}

export interface SentryDetector {
	id: string;
	/** Null for an "all projects" detector. */
	projectId: string | null;
	name: string;
	/** `issue_stream` receives every issue of its project; `error` is the error monitor. */
	type: string;
	workflowIds: string[];
}

const seg = encodeURIComponent;

export function workflows(rest: RestClient) {
	return {
		/** The alert rules (workflows) of an organization. */
		list: (org: string): Promise<SentryWorkflow[]> =>
			rest.request<SentryWorkflow[]>(`/organizations/${seg(org)}/workflows/`),

		get: (org: string, id: string): Promise<SentryWorkflow> =>
			rest.request<SentryWorkflow>(`/organizations/${seg(org)}/workflows/${seg(id)}/`),

		create: (org: string, input: SentryWorkflowInput): Promise<SentryWorkflow> =>
			rest.request<SentryWorkflow>(`/organizations/${seg(org)}/workflows/`, {
				method: "POST",
				body: input,
			}),

		/**
		 * Replace a workflow with the given body. Sentry offers no version or ETag to make this conditional, so a concurrent
		 * edit is overwritten: read, change and write back without another writer in between.
		 */
		update: (org: string, id: string, input: SentryWorkflowInput): Promise<SentryWorkflow> =>
			rest.request<SentryWorkflow>(`/organizations/${seg(org)}/workflows/${seg(id)}/`, {
				method: "PUT",
				body: input,
			}),

		/** Remove a workflow. Sentry answers 204 with no body. */
		delete: (org: string, id: string): Promise<void> =>
			rest.request<void>(`/organizations/${seg(org)}/workflows/${seg(id)}/`, { method: "DELETE" }),

		/** The detectors of an organization: what a workflow is attached to. */
		detectors: (org: string): Promise<SentryDetector[]> =>
			rest.request<SentryDetector[]>(`/organizations/${seg(org)}/detectors/`),
	};
}
