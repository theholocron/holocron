import type { GitHubApp, GitHubAppInstallation } from "@theholocron/github-client";
import type { CheckRow } from "@theholocron/kyber/ui";

import type { GitHubAppManifest } from "./doctor-github-app.type.js";
import { permissionGaps } from "./permission-gaps.js";
import { appSettingsUrl, installationSettingsUrl } from "./settings-urls.js";

const row = (name: string, what: string, problems: string[], ok: string): CheckRow => ({
	id: `${name}:${what}`,
	title: `${name}: ${what}`,
	status: problems.length > 0 ? "fail" : "ok",
	detail: problems.length > 0 ? `${problems.length} problem(s)` : ok,
	problems,
});

/** Extras are information only: they never fail a row, they are named in its detail. */
const extrasNote = (noun: string, extras: string[]): string =>
	extras.length > 0 ? `; info: ${extras.length} ${noun} not in the manifest (${extras.join(", ")})` : "";

/**
 * The events, permissions and installations rows of one App instance: the manifest against the live App, and the live
 * App against what each installation has accepted. A row that fails ends with the page that fixes it.
 */
export function appRows(
	name: string,
	manifest: GitHubAppManifest,
	app: GitHubApp,
	installations: GitHubAppInstallation[]
): CheckRow[] {
	const fix = `fix: ${appSettingsUrl(app)} (events are on the same page, under "Subscribe to events")`;

	const eventProblems = manifest.events.filter((e) => !app.events.includes(e)).map((e) => `missing event ${e}`);
	const extraEvents = app.events.filter((e) => !manifest.events.includes(e));
	const permissionProblems = permissionGaps(manifest.permissions, app.permissions);
	const extraPermissions = Object.keys(app.permissions).filter((p) => !(p in manifest.permissions));

	const installationProblems = installations.flatMap((installation) => {
		const gaps = [
			...permissionGaps(app.permissions, installation.permissions),
			...app.events.filter((e) => !installation.events.includes(e)).map((e) => `missing event ${e}`),
		];
		if (gaps.length === 0) return [];
		const who = installation.account?.login ?? `installation ${installation.id}`;
		const url = installationSettingsUrl(installation.account, installation.id);
		return [
			`${who} has not accepted the current App: ${gaps.join("; ")}`,
			`fix: ${who} accepts the update at ${url}`,
		];
	});

	return [
		row(
			name,
			"events",
			eventProblems.length > 0 ? [...eventProblems, fix] : [],
			`all ${manifest.events.length} subscribed${extrasNote("extra event(s)", extraEvents)}`
		),
		row(
			name,
			"permissions",
			permissionProblems.length > 0 ? [...permissionProblems, fix] : [],
			`all ${Object.keys(manifest.permissions).length} granted${extrasNote("extra permission(s)", extraPermissions)}`
		),
		row(name, "installations", installationProblems, `${installations.length} installation(s) up to date`),
	];
}
