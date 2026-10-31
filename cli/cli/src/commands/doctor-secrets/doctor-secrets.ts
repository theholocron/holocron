/**
 * `holocron doctor secrets` — do the secrets the config says must exist, exist?
 *
 * Read-only, names only: GitHub never returns a value. One row for the repository's secrets, one for the
 * organization's and one per environment, each only when the config expects something there (see
 * {@link expectedSecrets}). A secret that exists but is not expected is never a problem. A scope that cannot be
 * read because there is no provider, or no token for it, is a skip with the reason, not a failure.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	PluginLoader,
	type Secrets,
	type SecretScope,
	type Vault,
} from "../../plugin/index.js";
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "../doctor-checks/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import type { DoctorSecretsReport, RunDoctorSecretsInput } from "./doctor-secrets.type.js";
import { expectedSecrets } from "./expected-secrets.js";
import { syncedSecrets } from "./synced-secrets.js";
import { uniqueNames } from "./unique-names.js";

interface ScopeCheck {
	id: string;
	title: string;
	/** The scope to list, or why there is none to look under. */
	scope: SecretScope | { problem: string };
	names: string[];
}

export async function runDoctorSecrets(input: RunDoctorSecretsInput): Promise<DoctorSecretsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor secrets");

	const config = input.loaded.resolved;
	const layouts = (loader.has("notifications") ? loader.get("notifications") : []).flatMap((p) =>
		p.layout ? [p.layout] : []
	);
	const expected = expectedSecrets(config, layouts);
	const org = input.context.org ?? (input.context.repo ?? config.repo?.name ?? "").split("/")[0];

	// What `repo.secrets.sync` adds: names join the scope's own check, an organization other than ours gets its own.
	const syncEntries = config.repo?.secrets?.sync ?? [];
	const synced = await syncedSecrets(
		syncEntries,
		loader.has("vault")
			? (loader.get("vault") as Vault)
			: { why: whyMissing(loader, "vault", "no `vault` provider to list the environment's keys with") }
	);
	const foreignOrgs = new Map<string, string[]>();
	for (const { scope, names } of synced.scopes) {
		if (scope.kind === "repo") expected.repo = uniqueNames([...expected.repo, ...names]);
		else if (scope.kind === "environment") {
			expected.environments[scope.name] = uniqueNames([...(expected.environments[scope.name] ?? []), ...names]);
		} else if (scope.name === org) expected.org = uniqueNames([...expected.org, ...names]);
		else foreignOrgs.set(scope.name, uniqueNames([...(foreignOrgs.get(scope.name) ?? []), ...names]));
	}

	const checks: ScopeCheck[] = [];
	if (expected.repo.length > 0) {
		checks.push({
			id: "repo-secrets",
			title: "repository secrets exist",
			scope: { kind: "repo" },
			names: expected.repo,
		});
	}
	if (expected.org.length > 0) {
		checks.push({
			id: "org-secrets",
			title: "organization secrets exist",
			scope: org
				? { kind: "organization", name: org }
				: { problem: "no organization: set `org` in the config or run inside a repository" },
			names: expected.org,
		});
	}
	for (const [env, names] of Object.entries(expected.environments)) {
		if (names.length === 0) continue;
		checks.push({
			id: `env-secrets-${env}`,
			title: `${env} environment secrets exist`,
			scope: { kind: "environment", name: env },
			names,
		});
	}

	for (const [name, names] of foreignOrgs) {
		if (names.length === 0) continue;
		checks.push({
			id: `org-secrets-${name}`,
			title: `${name} organization secrets exist`,
			scope: { kind: "organization", name },
			names,
		});
	}

	const rows: CheckRow[] = [];
	if (checks.length === 0 && synced.rows.length === 0) {
		rows.push({ id: "secrets", title: "secrets", status: "ok", detail: "none declared", problems: [] });
	} else if (!loader.has("secrets")) {
		const why = whyMissing(loader, "secrets", "no `secrets` provider to check them with");
		for (const { id, title } of checks) rows.push({ id, title, status: "skip", detail: why, problems: [] });
	} else {
		const secrets = loader.get("secrets") as Secrets;
		for (const check of checks) rows.push(await checkScope(secrets, check));
	}

	rows.push(...synced.rows);

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor secrets");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

async function checkScope(secrets: Secrets, check: ScopeCheck): Promise<CheckRow> {
	const { id, title, scope, names } = check;
	if ("problem" in scope) return { id, title, status: "fail", detail: "1 problem(s)", problems: [scope.problem] };
	try {
		const have = await secrets.listSecrets(scope);
		// GitHub treats names as case-insensitive: read what it holds under the spelling the config uses.
		const spelled = new Map(names.map((name) => [name.toUpperCase(), name]));
		const problems = declaredVsActual(
			new Map(names.map((name) => [name, true])),
			new Map(have.map((name) => [spelled.get(name.toUpperCase()) ?? name, true])),
			{ noun: "secret", flagExtra: false }
		);
		return problems.length > 0
			? { id, title, status: "fail", detail: `${problems.length} problem(s)`, problems }
			: { id, title, status: "ok", detail: `${names.length} of ${names.length} exist`, problems: [] };
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return { id, title, status: "skip", detail: noToken, problems: [] };
		return { id, title, status: "fail", detail: errorMessage(err), problems: [] };
	}
}
