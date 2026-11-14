import { type CheckRow, declaredVsActual } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { PluginLoader, Secrets, SecretScope, Vault } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { layoutSecretNames, whyMissing } from "../notifications-channel-add/index.js";
import { repoName } from "../secrets-sync/repo-name/index.js";
import { accessRow, type OrgReaders, shadowRow } from "./access-rows.js";
import type { SecretObservation } from "./doctor-secrets.type.js";
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

/**
 * The `ci` side of `doctor secrets`: the GitHub secrets the config expects (`repo.secrets`, the notification layouts'
 * secrets and what `repo.secrets.sync` fills) against the ones the `secrets` provider holds, who can read the
 * organization ones, and a skipped row for each `repo.secrets.sync` entry that could not be resolved.
 *
 * @param loader - The loaded plugins.
 * @param config - The resolved config.
 * @param vault - The `vault` provider, or why there is none.
 * @param org - The organization the organization secrets live in, when it is known.
 * @returns The rows, what each scope held (names only, for the matrix), and whether the config declares anything on this
 *   side (when it does not, the caller says so once).
 */
export async function ciRows(
	loader: PluginLoader,
	config: ResolvedHolocronConfig,
	vault: Vault | { why: string },
	org: string | undefined
): Promise<{ declared: boolean; rows: CheckRow[]; observations: SecretObservation[] }> {
	const layouts = (loader.has("notifications") ? loader.get("notifications") : []).flatMap((p) =>
		p.layout ? [p.layout] : []
	);
	const expected = expectedSecrets(config, layouts);

	// What `repo.secrets.sync` adds: names join the scope's own check, an organization other than ours gets its own.
	const synced = await syncedSecrets(config.repo?.secrets?.sync ?? [], vault);
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
	const observations: SecretObservation[] = [];
	if (checks.length === 0 && synced.rows.length === 0) return { declared: false, rows, observations };
	if (!loader.has("secrets")) {
		const why = whyMissing(loader, "secrets", "no `secrets` provider to check them with");
		for (const { id, title, scope, names } of checks) {
			rows.push({ id, title, status: "skip", detail: why, problems: [] });
			if (!("problem" in scope)) observations.push({ scope, needed: names, unread: why });
		}
	} else {
		const secrets = loader.get("secrets") as Secrets;
		for (const check of checks) {
			const checked = await checkScope(secrets, check);
			rows.push(checked.row);
			if (!("problem" in check.scope)) {
				observations.push({
					scope: check.scope,
					needed: check.names,
					...(checked.have ? { have: checked.have } : { unread: checked.row.detail }),
				});
			}
		}
		// Who can read the organization secrets the sync fills, and a name that a repository secret overrides (#2062).
		const readers = new Map<string, OrgReaders>();
		for (const { scope, names, repos } of synced.scopes) {
			if (scope.kind !== "organization" || !repos) continue;
			const entry = readers.get(scope.name) ?? { org: scope.name, declared: new Map<string, string[]>() };
			for (const name of names) entry.declared.set(name, [...new Set(repos)].sort());
			readers.set(scope.name, entry);
		}
		// The notification secrets a layout fills are readable by its `readers` (#2131); a layout with none declares nothing.
		for (const layout of layouts) {
			if (!org || !layout.readers?.length) continue;
			const entry = readers.get(org) ?? { org, declared: new Map<string, string[]>() };
			const repos = [...new Set(layout.readers.map(repoName))].sort();
			for (const name of layoutSecretNames(layout)) entry.declared.set(name, repos);
			readers.set(org, entry);
		}
		for (const entry of readers.values()) rows.push(await accessRow(secrets, entry, entry.org === org));
		if (expected.org.length > 0) rows.push(await shadowRow(secrets, expected.org));
	}
	rows.push(...synced.rows);
	return { declared: true, rows, observations };
}

async function checkScope(secrets: Secrets, check: ScopeCheck): Promise<{ row: CheckRow; have?: string[] }> {
	const { id, title, scope, names } = check;
	if ("problem" in scope) {
		return { row: { id, title, status: "fail", detail: "1 problem(s)", problems: [scope.problem] } };
	}
	try {
		const have = await secrets.listSecrets(scope);
		// GitHub treats names as case-insensitive: read what it holds under the spelling the config uses.
		const spelled = new Map(names.map((name) => [name.toUpperCase(), name]));
		const problems = declaredVsActual(
			new Map(names.map((name) => [name, true])),
			new Map(have.map((name) => [spelled.get(name.toUpperCase()) ?? name, true])),
			{ noun: "secret", flagExtra: false }
		);
		const row: CheckRow =
			problems.length > 0
				? { id, title, status: "fail", detail: `${problems.length} problem(s)`, problems }
				: { id, title, status: "ok", detail: `${names.length} of ${names.length} exist`, problems: [] };
		return { row, have };
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return { row: { id, title, status: "skip", detail: noToken, problems: [] } };
		return { row: { id, title, status: "fail", detail: errorMessage(err), problems: [] } };
	}
}
