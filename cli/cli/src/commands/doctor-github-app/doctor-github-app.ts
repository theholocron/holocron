/**
 * `holocron doctor github-app` — does each registered GitHub App instance have what its manifest declares?
 *
 * GitHub has no API that changes an existing App's permissions or event subscriptions, so each instance is changed by
 * hand in its settings page and a missed one fails quietly. Read-only: for every entry of `githubApps` it reads the
 * manifest file, reads the instance's `SENTINEL_GITHUB_APP_ID` and `SENTINEL_GITHUB_APP_PRIVATE_KEY` (else the bare `GITHUB_APP_ID` and
 * `GITHUB_APP_PRIVATE_KEY`) from its vault environment in
 * memory (never printed, never written), signs the App's own JWT and calls `GET /app` and `GET /app/installations`.
 * Rows per instance: reachable; events (every manifest event is subscribed); permissions (each manifest permission is
 * granted at least at its level, `read < write < admin`); installations (none lags the App, which is a pending
 * update an owner has not accepted); deliveries (no webhook delivery of the last day failed and stayed failed, SPEC-0099;
 * a log that cannot be read is a skip). Extras on the App are named in a row's detail as `info`, never a failure. A row
 * that fails ends with the settings page that fixes it. An instance whose credentials cannot be read is a skip with
 * the reason; an unreadable manifest, a rejected JWT or a gap is a failure.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getApp, listAppDeliveries, listAppInstallations } from "@theholocron/github-client";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { GitHubAppConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../plugin/index.js";
import { appRows } from "./app-rows.js";
import { deliveryRow } from "./delivery-row.js";
import type {
	DoctorGitHubAppReport,
	GitHubAppApi,
	GitHubAppManifest,
	RunDoctorGitHubAppInput,
} from "./doctor-github-app.type.js";
import { parseManifest } from "./parse-manifest.js";
import { readAppCredentials, scrubbed } from "./read-app-credentials.js";
import { appSettingsUrl } from "./settings-urls.js";

const defaultApi: GitHubAppApi = { getApp, listAppInstallations, listAppDeliveries };

export async function runDoctorGitHubApp(input: RunDoctorGitHubAppInput): Promise<DoctorGitHubAppReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const instances = input.loaded.resolved.githubApps ?? [];

	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	if (instances.length > 0) {
		await loader.load();
		assertPluginsResolvable(loader, "doctor github-app");
	}

	const rows: CheckRow[] = [];
	if (instances.length === 0) {
		rows.push(row("github-app", "reachable", "skip", "no `githubApps` are declared in holocron.config.ts"));
	}
	for (const instance of instances) rows.push(...(await checkInstance(instance, loader, input)));

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor github-app");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

function row(name: string, what: string, status: CheckRow["status"], detail: string): CheckRow {
	return { id: `${name}:${what}`, title: `${name}: ${what}`, status, detail, problems: [] };
}

async function checkInstance(
	instance: GitHubAppConfig,
	loader: PluginLoader,
	input: RunDoctorGitHubAppInput
): Promise<CheckRow[]> {
	const { name } = instance;
	const readManifest =
		input.readManifest ?? ((path: string) => readFileSync(join(input.context.repoRoot, path), "utf8"));
	let manifest: GitHubAppManifest;
	try {
		manifest = parseManifest(readManifest(instance.manifest));
	} catch (err) {
		return [row(name, "manifest", "fail", `cannot read ${instance.manifest}: ${errorMessage(err)}`)];
	}

	const read = await readAppCredentials(instance, loader);
	if ("reason" in read) return [row(name, "reachable", "skip", read.reason)];

	const api = input.api ?? defaultApi;
	const secrets = [read.creds.privateKey];
	try {
		const app = await api.getApp(read.creds);
		const installations = await api.listAppInstallations(read.creds);
		const owner = app.owner ? `, owned by ${app.owner.login}` : "";
		return [
			row(name, "reachable", "ok", `${app.slug}${owner}, settings: ${appSettingsUrl(app)}`),
			...appRows(name, manifest, app, installations),
			await deliveryRow(name, read.creds, api, (input.now ?? Date.now)(), secrets),
		];
	} catch (err) {
		return [row(name, "reachable", "fail", `cannot call GitHub as the App: ${scrubbed(err, secrets)}`)];
	}
}
