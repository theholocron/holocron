import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, VariableScope } from "@theholocron/github-client";

/** What the declaration asks of one organization variable. */
export interface OrgVariable {
	value: string;
	visibility: "all" | "private";
}

/** GitHub's rule for a variable name: letters, digits and underscores, not starting with a digit or `GITHUB_`. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Longest name GitHub accepts. */
const MAX_NAME = 256;

function assertNames(names: string[]): void {
	for (const name of names) {
		if (!NAME.test(name) || name.length > MAX_NAME || name.toUpperCase().startsWith("GITHUB_")) {
			throw new Error(
				`invalid variable name ${JSON.stringify(name)}: use letters, digits and underscores (at most ${MAX_NAME}), not starting with a digit or GITHUB_`
			);
		}
	}
}

/** GitHub treats variable names as case-insensitive, so every comparison goes through this. */
const key = (name: string): string => name.toUpperCase();

interface Options {
	prune: boolean;
	/** Read the current state and describe what would change; write nothing. */
	dryRun: boolean;
}

/**
 * Bring one scope's variables in line with the declaration: create what is missing, update what differs, leave what
 * already matches. Variables that exist but are not declared are left alone, or deleted with `prune`, except an
 * organization variable limited to selected repositories, which this client cannot manage and so is never deleted.
 * Returns a one-line summary, naming the ones left so drift is visible. In a dry run it only describes the changes.
 */
async function reconcile(
	client: GitHubClient,
	repo: string,
	scope: VariableScope,
	wanted: Array<{ name: string; value: string; visibility?: "all" | "private" }>,
	opts: Options
): Promise<string> {
	assertNames(wanted.map((w) => w.name));
	const existing = new Map((await client.variables.listVariables(repo, scope)).map((v) => [key(v.name), v]));
	const counts = { created: 0, updated: 0, unchanged: 0, deleted: 0 };

	for (const want of wanted) {
		const have = existing.get(key(want.name));
		const body: Record<string, unknown> = { name: want.name, value: want.value };
		if (want.visibility) body["visibility"] = want.visibility;
		if (!have) {
			if (opts.dryRun) {
				counts.created++;
				continue;
			}
			try {
				await client.variables.createVariable(repo, scope, body);
				counts.created++;
				continue;
			} catch (err) {
				// Created by someone else since the listing: fall through to the update.
				if (!(err instanceof ProviderApiError && (err.status === 409 || err.status === 422))) throw err;
			}
		} else if (have.value === want.value && (!want.visibility || have.visibility === want.visibility)) {
			counts.unchanged++;
			continue;
		}
		// Address it by the name GitHub holds it under when that is spelled differently.
		if (!opts.dryRun) await client.variables.updateVariable(repo, scope, have?.name ?? want.name, body);
		counts.updated++;
	}

	const declared = new Set(wanted.map((w) => key(w.name)));
	const undeclared = [...existing.entries()].filter(([k]) => !declared.has(k)).map(([, v]) => v);
	const unmanaged = undeclared.filter((v) => v.visibility === "selected");
	if (opts.prune) {
		for (const v of undeclared.filter((u) => u.visibility !== "selected")) {
			if (!opts.dryRun) await client.variables.deleteVariable(repo, scope, v.name);
			counts.deleted++;
		}
	}

	const parts = opts.dryRun
		? [`would create ${counts.created}`, `would update ${counts.updated}`, `${counts.unchanged} unchanged`]
		: [`${counts.created} created`, `${counts.updated} updated`, `${counts.unchanged} unchanged`];
	if (counts.deleted > 0) parts.push(`${counts.deleted} ${opts.dryRun ? "would be deleted" : "deleted"}`);
	const left = opts.prune ? unmanaged : undeclared;
	if (left.length > 0) {
		const why = opts.prune ? "limited to selected repositories, not managed" : "not declared, left alone";
		parts.push(`${left.length} ${why}: ${left.map((v) => v.name).join(", ")}`);
	}
	return parts.join(", ");
}

/** Reconcile a repository's Actions variables. */
export function syncVariables(
	client: GitHubClient,
	repo: string,
	variables: Record<string, string>,
	opts: { prune?: boolean; dryRun?: boolean } = {}
): Promise<string> {
	const wanted = Object.entries(variables).map(([name, value]) => ({ name, value }));
	return reconcile(client, repo, { kind: "repo" }, wanted, {
		prune: opts.prune === true,
		dryRun: opts.dryRun === true,
	});
}

/** Reconcile an organization's Actions variables. `repo` is only the coordinate the client is bound to. */
export function syncOrgVariables(
	client: GitHubClient,
	repo: string,
	org: string,
	variables: Record<string, OrgVariable>,
	opts: { prune?: boolean; dryRun?: boolean } = {}
): Promise<string> {
	const wanted = Object.entries(variables).map(([name, v]) => ({ name, value: v.value, visibility: v.visibility }));
	return reconcile(client, repo, { kind: "organization", org }, wanted, {
		prune: opts.prune === true,
		dryRun: opts.dryRun === true,
	});
}
