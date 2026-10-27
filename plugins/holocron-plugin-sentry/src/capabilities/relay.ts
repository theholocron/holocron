import type { EnsureRelayInput, EnsureRelayResult } from "@theholocron/cli";
import type { SentryApp, SentryWorkflow, SentryWorkflowInput } from "@theholocron/sentry-client";

import type { SentryClient } from "../rest.js";

/** What the integration needs to read: the alert's event. It is also why reading its secret needs the same scope. */
const INTEGRATION_SCOPES = ["event:read"];
const DEFAULT_FREQUENCY = 5;

/**
 * The alert action that sends through an integration, in the shape Sentry's own page writes when "Send a notification via
 * an integration" is picked: a `webhook` action named by the integration's slug. (A `sentry_app` action with the numeric
 * id is accepted too, but the page shows it as an unknown integration.)
 */
const integrationAction = (slug: string) => ({
	type: "webhook",
	config: { targetType: null, targetDisplay: null, targetIdentifier: slug },
	data: {},
});

const sendsThrough = (action: { type: string; config: Record<string, unknown> }, slug: string): boolean =>
	action.type === "webhook" && action.config["targetIdentifier"] === slug;

/** The `sentry_app` form an earlier version wrote for this integration, which the page cannot name. */
const isLegacyAction = (action: { type: string; config: Record<string, unknown> }, appId: number): boolean =>
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
function newWorkflow(name: string, frequency: number, detectorIds: string[], slug: string): SentryWorkflowInput {
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
		actionFilters: [{ logicType: "all", conditions: [], actions: [integrationAction(slug)] }],
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
	// Without event:read Sentry sends no event with the alert; any other scope a person gave it stays.
	const scopes = [...new Set([...existing.scopes, ...INTEGRATION_SCOPES])];
	if (scopes.length !== existing.scopes.length) updated.push("scopes");
	if (updated.length === 0) return { app: existing, created: false, updated };
	// Sentry wants the name and scopes on every update.
	const app = await client.sentryApps.update(existing.slug, {
		name: existing.name,
		scopes,
		webhookUrl: input.webhookUrl,
		isAlertable: true,
	});
	return { app, created: false, updated };
}

/** The issue stream detector of each project, so a wrong project fails before anything is changed. */
async function detectorsFor(client: SentryClient, org: string, slugs: string[]): Promise<string[]> {
	const [projects, detectors] = await Promise.all([client.projects.list(org), client.workflows.detectors(org)]);
	return slugs.map((slug) => {
		const project = projects.find((p) => p.slug === slug);
		if (!project) throw new Error(`Sentry project \`${slug}\` was not found in ${org}`);
		const detector = detectors.find((d) => d.projectId === project.id && d.type === "issue_stream");
		if (!detector) throw new Error(`Sentry project \`${slug}\` has no issue stream detector to attach an alert to`);
		return detector.id;
	});
}

/** The alert rule: one workflow for every project, found by name, made if missing, reconciled if not. */
async function ensureRule(
	client: SentryClient,
	org: string,
	input: EnsureRelayInput,
	install: { slug: string; appId: number },
	detectorIds: string[]
): Promise<{ created: boolean; updated: string[] }> {
	const workflows = await client.workflows.list(org);
	const frequency = input.rule.frequency ?? DEFAULT_FREQUENCY;
	const existing = workflows.find((w) => w.name === input.rule.name);
	if (!existing) {
		await client.workflows.create(org, newWorkflow(input.rule.name, frequency, detectorIds, install.slug));
		return { created: true, updated: [] };
	}

	// Adopt it: keep the conditions and filters a person set, and make sure it is on, attached and sends here.
	const next = toInput(existing);
	const updated: string[] = [];
	if (!existing.enabled) {
		next.enabled = true;
		updated.push("enabled");
	}
	if (input.rule.frequency !== undefined && existing.config.frequency !== input.rule.frequency) {
		next.config = { ...existing.config, frequency: input.rule.frequency };
		updated.push("frequency");
	}
	const missing = detectorIds.filter((id) => !existing.detectorIds.includes(id));
	if (missing.length > 0) {
		next.detectorIds = [...existing.detectorIds, ...missing];
		updated.push("projects");
	}
	const sends = existing.actionFilters.some((f) => f.actions.some((a) => sendsThrough(a, install.slug)));
	const legacy = existing.actionFilters.some((f) => f.actions.some((a) => isLegacyAction(a, install.appId)));
	if (legacy) {
		for (const f of next.actionFilters) f.actions = f.actions.filter((a) => !isLegacyAction(a, install.appId));
	}
	if (!sends) {
		// On a filter with no conditions, so a person's narrower filters do not narrow what is relayed.
		const open = next.actionFilters.find((f) => f.conditions.length === 0);
		if (open) open.actions.push(integrationAction(install.slug));
		else next.actionFilters.push({ logicType: "all", conditions: [], actions: [integrationAction(install.slug)] });
	}
	if (legacy || !sends) updated.push("action");
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
	const detectorIds = await detectorsFor(client, org, input.projects);
	const integration = await ensureIntegration(client, org, input);
	const installs = await client.sentryApps.installations(org);
	const install = installs.find((i) => i.app.slug === integration.app.slug);
	if (!install) throw new Error(`the integration \`${integration.app.name}\` is not installed on ${org}`);
	const rule = await ensureRule(
		client,
		org,
		input,
		{ slug: install.app.slug, appId: install.app.sentryAppId },
		detectorIds
	);
	const clientSecret = await secretOf(client, integration.app);
	return {
		integration: { created: integration.created, updated: integration.updated },
		rule,
		...(clientSecret ? { clientSecret } : {}),
	};
}
