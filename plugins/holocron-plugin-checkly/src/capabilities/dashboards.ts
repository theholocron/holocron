/**
 * The dashboard half of the Checkly `monitoring` capability.
 *
 * A Checkly dashboard has no name, only a `header`, so that is what it is found by (exact match, from the account's
 * list). A dashboard shows the checks whose `tags` match its own. Nothing here deletes, and a field the declaration
 * leaves out is left alone on an existing dashboard, except privacy, which always has a value (private unless the
 * declaration says otherwise) and so is always brought in line.
 *
 * The view key of a private dashboard is a credential. It is returned once, as `key`, when this call made the dashboard
 * or switched it to private, so a later run (which finds the dashboard as declared) returns none and the hand-off file
 * of the first run is never asked for twice. It is never logged, and `inspectDashboard` never returns it.
 */

import type { EnsuredResource, MonitoringDashboardInput, MonitoringDashboardState } from "@theholocron/cli";

import type { ChecklyClient, Dashboard, DashboardInput } from "../rest.js";

/** Whether two tag lists hold the same tags, in any order. */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
	const left = [...new Set(a)].sort();
	const right = [...new Set(b)].sort();
	return left.length === right.length && left.every((tag, i) => tag === right[i]);
}

/** The dashboard whose header is exactly `name`, from the account's list. */
async function findDashboard(client: ChecklyClient, name: string): Promise<Dashboard | undefined> {
	return (await client.dashboards.list()).find((d) => d.header === name);
}

/** The first view key the provider returned for a dashboard, if it returned one. */
function viewKey(dashboard: Dashboard): string | undefined {
	return dashboard.keys?.find((k) => k.rawKey)?.rawKey;
}

/** Find-or-create-or-update the dashboard `input.name`; see the file header. */
export async function ensureDashboard(
	client: ChecklyClient,
	input: MonitoringDashboardInput
): Promise<EnsuredResource & { key?: string }> {
	const wantPrivate = input.private ?? true;
	const existing = await findDashboard(client, input.name);

	if (!existing) {
		const body: DashboardInput & { header: string } = {
			header: input.name,
			tags: input.tags,
			isPrivate: wantPrivate,
			...(input.description !== undefined ? { description: input.description } : {}),
			...(input.domain !== undefined ? { customDomain: input.domain } : {}),
		};
		const created = await client.dashboards.create(body);
		const id = created.dashboardId;
		if (!wantPrivate) return { id, created: true };
		// The create response may not carry the key; the dashboard itself does.
		const key = viewKey(created) ?? viewKey(await client.dashboards.get(id));
		return { id, created: true, ...(key ? { key } : {}) };
	}

	const changes: DashboardInput = {};
	const updated: string[] = [];
	if (!sameTags(existing.tags ?? [], input.tags)) {
		changes.tags = input.tags;
		updated.push("tags");
	}
	const wasPrivate = existing.isPrivate === true;
	if (wasPrivate !== wantPrivate) {
		changes.isPrivate = wantPrivate;
		updated.push("private");
	}
	if (input.description !== undefined && existing.description !== input.description) {
		changes.description = input.description;
		updated.push("description");
	}
	if (input.domain !== undefined && existing.customDomain !== input.domain) {
		changes.customDomain = input.domain;
		updated.push("domain");
	}
	if (updated.length === 0) return { id: existing.dashboardId, created: false };

	await client.dashboards.update(existing.dashboardId, changes);
	// Only a dashboard that has just become private has a key nobody has been handed.
	const key = wantPrivate && !wasPrivate ? viewKey(await client.dashboards.get(existing.dashboardId)) : undefined;
	return { id: existing.dashboardId, created: false, updated, ...(key ? { key } : {}) };
}

/** Read the dashboard `name` and the headers of the account's others. Read-only; never returns a key. */
export async function inspectDashboard(client: ChecklyClient, name: string): Promise<MonitoringDashboardState> {
	const all = await client.dashboards.list();
	const found = all.find((d) => d.header === name);
	const others = all.filter((d) => d !== found).map((d) => d.header ?? d.dashboardId);
	if (!found) return { exists: false, others };
	return {
		exists: true,
		private: found.isPrivate === true,
		tags: [...(found.tags ?? [])],
		...(found.customDomain ? { domain: found.customDomain } : {}),
		others,
	};
}
