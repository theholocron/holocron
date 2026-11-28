import type { RestClient } from "../utils.js";

/** A condition of a workflow trigger or action filter. */
export interface SentryWorkflowCondition {
	/** The condition type. */
	type: string;
	/** What the condition compares against; its shape depends on `type`. */
	comparison: unknown;
	/** The result the condition produces when it holds; its shape depends on `type`. */
	conditionResult: unknown;
}

/** An action a workflow runs, such as notifying a channel. */
export interface SentryWorkflowAction {
	/** The action type. */
	type: string;
	/** The action's settings; their shape depends on `type`. */
	config: Record<string, unknown>;
	/** Extra data for the action; its shape depends on `type`. */
	data: Record<string, unknown>;
}

/** A group of conditions with the actions to run when they hold. */
export interface SentryWorkflowActionFilter {
	/** How `conditions` combine. */
	logicType: string;
	/** The conditions to test. */
	conditions: SentryWorkflowCondition[];
	/** The actions to run. */
	actions: SentryWorkflowAction[];
}

/** What a workflow (an alert rule in Sentry's Monitors → Alerts) is made of, as sent when creating or updating one. */
export interface SentryWorkflowInput {
	/** The workflow's name. */
	name: string;
	/** Whether the workflow is active. */
	enabled: boolean;
	/** The environment it is limited to, or `null` for all. */
	environment: string | null;
	/** `frequency` is minutes between notifications for one issue. */
	config: {
		/** Minutes between notifications for one issue. */
		frequency: number;
	};
	/** The detectors it is attached to; an issue stream detector per project covers that project's issues. */
	detectorIds: string[];
	/** The conditions that start the workflow. */
	triggers: {
		/** How `conditions` combine. */
		logicType: string;
		/** The conditions to test. */
		conditions: SentryWorkflowCondition[];
	};
	/** The condition groups with the actions each runs. */
	actionFilters: SentryWorkflowActionFilter[];
}

/** A condition or action as a read returns it: the same shape, with the id Sentry gave it. */
export type SentryWorkflowConditionRead = SentryWorkflowCondition & {
	id?: string;
};
export type SentryWorkflowActionRead = SentryWorkflowAction & { id?: string };

export interface SentryWorkflow extends SentryWorkflowInput {
	/** The workflow id. */
	id: string;
	triggers: {
		/** The id Sentry gave the trigger group. */
		id?: string;
		/** How `conditions` combine. */
		logicType: string;
		/** The trigger conditions, with the ids Sentry gave them. */
		conditions: SentryWorkflowConditionRead[];
	};
	/** The condition groups with the actions each runs, with the ids Sentry gave them. */
	actionFilters: Array<{
		id?: string;
		logicType: string;
		conditions: SentryWorkflowConditionRead[];
		actions: SentryWorkflowActionRead[];
	}>;
}

/** A detector: what a workflow is attached to. */
export interface SentryDetector {
	/** The detector id. */
	id: string;
	/** Null for an "all projects" detector. */
	projectId: string | null;
	/** The detector's name. */
	name: string;
	/** `issue_stream` receives every issue of its project; `error` is the error monitor. */
	type: string;
	/** The ids of the workflows attached to it. */
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
