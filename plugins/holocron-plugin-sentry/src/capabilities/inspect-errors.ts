import type { ErrorsInspection, InspectErrorsInput } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { SentryClient } from "../rest.js";

const notFound = (err: unknown): boolean => err instanceof ProviderApiError && err.status === 404;

/**
 * Read the organization and the named projects: that each exists, has a client key, and is watched by an enabled
 * alert rule. Reads only. Counts the keys and rules and returns neither, so no DSN or key leaves this function.
 * The alert rules are read with `alertsClient` (the relay token, which has the alert scope); one that cannot be read
 * does not fail the rest, it is reported in `alertsUnreadable`.
 */
export async function inspectSentryErrors(
	client: SentryClient,
	alertsClient: () => SentryClient,
	orgSlug: string,
	input: InspectErrorsInput
): Promise<ErrorsInspection> {
	let org: ErrorsInspection["org"];
	try {
		const found = await client.auth.getOrg(orgSlug);
		org = { slug: found.slug, exists: true, name: found.name };
	} catch (err) {
		if (!notFound(err)) throw err;
		return {
			org: { slug: orgSlug, exists: false },
			projects: input.projects.map((slug) => ({ slug, exists: false })),
		};
	}

	const found = new Map<string, { id: string; hasDsn: boolean }>();
	for (const slug of input.projects) {
		try {
			const project = await client.projects.get(orgSlug, slug);
			const keys = await client.projects.keys(orgSlug, project.slug);
			found.set(slug, { id: project.id, hasDsn: keys.length > 0 });
		} catch (err) {
			if (!notFound(err)) throw err;
		}
	}

	let rules: Map<string, number> | undefined;
	let alertsUnreadable: string | undefined;
	if (found.size > 0) {
		try {
			const alerts = alertsClient();
			const [detectors, workflows] = await Promise.all([
				alerts.workflows.detectors(orgSlug),
				alerts.workflows.list(orgSlug),
			]);
			rules = new Map();
			for (const { id: projectId } of found.values()) {
				const detector = detectors.find((d) => d.projectId === projectId && d.type === "issue_stream");
				rules.set(
					projectId,
					detector ? workflows.filter((w) => w.enabled && w.detectorIds.includes(detector.id)).length : 0
				);
			}
		} catch (err) {
			alertsUnreadable = err instanceof Error ? err.message : "the alert rules could not be read";
		}
	}

	return {
		org,
		projects: input.projects.map((slug) => {
			const project = found.get(slug);
			if (!project) return { slug, exists: false };
			const alertRules = rules?.get(project.id);
			return { slug, exists: true, hasDsn: project.hasDsn, ...(alertRules === undefined ? {} : { alertRules }) };
		}),
		...(alertsUnreadable === undefined ? {} : { alertsUnreadable }),
	};
}
