/**
 * `holocron doctor github-app` — does each registered GitHub App instance have what its manifest declares?
 *
 * GitHub has no API that changes an existing App's permissions or event subscriptions, so each instance is changed by
 * hand in its settings page and a missed one fails quietly. Read-only: for every entry of `githubApps` it reads the
 * manifest file, reads the instance's `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` from its vault environment in
 * memory (never printed, never written), signs the App's own JWT and calls `GET /app` and `GET /app/installations`.
 * Rows per instance: reachable; events (every manifest event is subscribed); permissions (each manifest permission is
 * granted at least at its level, `read < write < admin`); installations (none lags the App, which is a pending
 * update an owner has not accepted). Extras on the App are named in a row's detail as `info`, never a failure. A row
 * that fails ends with the settings page that fixes it. An instance whose credentials cannot be read is a skip with
 * the reason; an unreadable manifest, a rejected JWT or a gap is a failure.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getApp, type GitHubAppCredentials, listAppInstallations } from "@theholocron/github-client";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { GitHubAppConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Vault } from "../../plugin/index.js";
import { appRows } from "./app-rows.js";
import type {
	DoctorGitHubAppReport,
	GitHubAppApi,
	GitHubAppManifest,
	RunDoctorGitHubAppInput,
} from "./doctor-github-app.type.js";
import { parseManifest } from "./parse-manifest.js";
import { appSettingsUrl } from "./settings-urls.js";

const APP_ID = "GITHUB_APP_ID";
const PRIVATE_KEY = "GITHUB_APP_PRIVATE_KEY";

const defaultApi: GitHubAppApi = { getApp, listAppInstallations };

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

/** An error's message with the secrets it was handed taken out, so nothing read from the vault is ever printed. */
function scrubbed(err: unknown, secrets: string[]): string {
	return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join("[redacted]"), errorMessage(err));
}

/** The App's id and key from its vault environment, or the reason they cannot be had. */
async function readCredentials(
	instance: GitHubAppConfig,
	loader: PluginLoader
): Promise<{ creds: GitHubAppCredentials } | { reason: string }> {
	const vault = loader.has("vault") ? (loader.get("vault") as Vault) : undefined;
	if (!vault?.readEnvironment) {
		return {
			reason: vault
				? `${vault.providerName} cannot read an environment's variables`
				: "needs a `vault` provider in holocron.config.ts (1password)",
		};
	}
	let values: Record<string, string>;
	try {
		values = await vault.readEnvironment(instance.environment);
	} catch (err) {
		return { reason: `cannot read the "${instance.environment}" environment: ${errorMessage(err)}` };
	}
	const missing = [APP_ID, PRIVATE_KEY].filter((key) => !values[key]?.trim());
	if (missing.length > 0) return { reason: `"${instance.environment}" does not hold ${missing.join(" or ")}` };
	// A key kept on one line in a vault carries its line breaks as a literal `\n`.
	const privateKey = (values[PRIVATE_KEY] as string).includes("\n")
		? (values[PRIVATE_KEY] as string)
		: (values[PRIVATE_KEY] as string).replace(/\\n/g, "\n");
	return { creds: { appId: (values[APP_ID] as string).trim(), privateKey } };
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

	const read = await readCredentials(instance, loader);
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
		];
	} catch (err) {
		return [row(name, "reachable", "fail", `cannot call GitHub as the App: ${scrubbed(err, secrets)}`)];
	}
}
