import type { EnsureRelayInput, EnsureRelayResult } from "@theholocron/cli";
import type { SentryApp, SentryWorkflow, SentryWorkflowInput } from "@theholocron/sentry-client";

import type { SentryClient } from "../rest.js";

/** What the integration needs to read: the alert's event. It is also why reading its secret needs the same scope. */
const INTEGRATION_SCOPES = ["event:read"];
const DEFAULT_FREQUENCY = 5;

/** The alert action that sends through an integration: it points at the integration's numeric app id. */
const sentryAppAction = (appId: number) => ({
	type: "sentry_app",
	config: { targetType: "sentry_app", targetIdentifier: String(appId) },
	data: {},
});

const targetsApp = (action: { type: string; config: Record<string, unknown> }, appId: number): boolean =>
	action.type === "sentry_app" && String(action.config["targetIdentifier"]) === String(appId);

/** A workflow as Sentry returned it, as the body to send back (the nested ids are not part of an update). */
function toInput(wf: SentryWorkflow): SentryWorkflowInput {
	return {
		name: wf.name,
		enabled: wf.enabled,
		environment: wf.environment,
		config: wf.config,
		detectorIds: wf.detectorIds,
		triggers: {
			logicType: wf.triggers.logicType,
			conditions: wf.triggers.conditions.map((c) => ({
				type: c.type,
				comparison: c.comparison,
				conditionResult: c.conditionResult,
			})),
		},
		actionFilters: wf.actionFilters.map((f) => ({
			logicType: f.logicType,
			conditions: f.conditions.map((c) => ({
				type: c.type,
				comparison: c.comparison,
				conditionResult: c.conditionResult,
			})),
			actions: f.actions.map((a) => ({ type: a.type, config: a.config, data: a.data })),
		})),
	};
}

/** Sentry's own "high priority issues" rule, which is the default for a new alert. */
function newWorkflow(name: string, frequency: number, detectorIds: string[], appId: number): SentryWorkflowInput {
	return {
		name,
		enabled: true,
		environment: null,
		config: { frequency },
		detectorIds,
		triggers: {
			logicType: "any-short",
			conditions: [
				{ type: "new_high_priority_issue", comparison: true, conditionResult: true },
				{ type: "existing_high_priority_issue", comparison: true, conditionResult: true },
			],
		},
		actionFilters: [{ logicType: "all", conditions: [], actions: [sentryAppAction(appId)] }],
	};
}

/** The integration: found by name, made if missing, and its webhook and alert action brought in line. */
async function ensureIntegration(
	client: SentryClient,
	org: string,
	input: EnsureRelayInput
): Promise<{ app: SentryApp; created: boolean; updated: string[] }> {
	const apps = await client.sentryApps.list(org);
	const existing = apps.find((a) => a.name === input.name);
	if (!existing) {
		const app = await client.sentryApps.create(org, {
			name: input.name,
			scopes: INTEGRATION_SCOPES,
			webhookUrl: input.webhookUrl,
			isAlertable: true,
		});
		return { app, created: true, updated: [] };
	}
	const updated: string[] = [];
	if (existing.webhookUrl !== input.webhookUrl) updated.push("webhook URL");
	if (!existing.isAlertable) updated.push("alert action");
	if (updated.length === 0) return { app: existing, created: false, updated };
	// Sentry wants the name and scopes on every update; the scopes stay as they are.
	const app = await client.sentryApps.update(existing.slug, {
		name: existing.name,
		scopes: existing.scopes,
		webhookUrl: input.webhookUrl,
		isAlertable: true,
	});
	return { app, created: false, updated };
}

/** The alert rule: one workflow for every project, found by name, made if missing, reconciled if not. */
async function ensureRule(
	client: SentryClient,
	org: string,
	input: EnsureRelayInput,
	appId: number
): Promise<{ created: boolean; updated: string[] }> {
	const [projects, detectors, workflows] = await Promise.all([
		client.projects.list(org),
		client.workflows.detectors(org),
		client.workflows.list(org),
	]);
	const detectorIds = input.projects.map((slug) => {
		const project = projects.find((p) => p.slug === slug);
		if (!project) throw new Error(`Sentry project \`${slug}\` was not found in ${org}`);
		const detector = detectors.find((d) => d.projectId === project.id && d.type === "issue_stream");
		if (!detector) throw new Error(`Sentry project \`${slug}\` has no issue stream detector to attach an alert to`);
		return detector.id;
	});
	const frequency = input.rule.frequency ?? DEFAULT_FREQUENCY;
	const existing = workflows.find((w) => w.name === input.rule.name);
	if (!existing) {
		await client.workflows.create(org, newWorkflow(input.rule.name, frequency, detectorIds, appId));
		return { created: true, updated: [] };
	}

	// Adopt it: keep the conditions and filters a person set, and make sure it is on, attached and sends here.
	const next = toInput(existing);
	const updated: string[] = [];
	if (!existing.enabled) {
		next.enabled = true;
		updated.push("enabled");
	}
	const missing = detectorIds.filter((id) => !existing.detectorIds.includes(id));
	if (missing.length > 0) {
		next.detectorIds = [...existing.detectorIds, ...missing];
		updated.push("projects");
	}
	const sends = existing.actionFilters.some((f) => f.actions.some((a) => targetsApp(a, appId)));
	if (!sends) {
		const first = next.actionFilters[0];
		if (first) first.actions.push(sentryAppAction(appId));
		else next.actionFilters.push({ logicType: "all", conditions: [], actions: [sentryAppAction(appId)] });
		updated.push("action");
	}
	if (updated.length === 0) return { created: false, updated };
	await client.workflows.update(org, existing.id, next);
	return { created: false, updated };
}

/** The signing secret, if the token may see it: a new integration's answer omits it, so it is read again. */
async function secretOf(client: SentryClient, app: SentryApp): Promise<string | undefined> {
	if (app.clientSecret) return app.clientSecret;
	return (await client.sentryApps.get(app.slug)).clientSecret || undefined;
}

export async function ensureSentryRelay(
	client: SentryClient,
	org: string,
	input: EnsureRelayInput
): Promise<EnsureRelayResult> {
	if (input.projects.length === 0) throw new Error("relay needs at least one Sentry project to alert on");
	const integration = await ensureIntegration(client, org, input);
	const installs = await client.sentryApps.installations(org);
	const install = installs.find((i) => i.app.slug === integration.app.slug);
	if (!install) throw new Error(`the integration \`${integration.app.name}\` is not installed on ${org}`);
	const rule = await ensureRule(client, org, input, install.app.sentryAppId);
	const clientSecret = await secretOf(client, integration.app);
	return {
		integration: { created: integration.created, updated: integration.updated },
		rule,
		...(clientSecret ? { clientSecret } : {}),
	};
}
