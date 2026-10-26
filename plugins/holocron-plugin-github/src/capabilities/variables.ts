import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, VariableScope } from "@theholocron/github-client";

/** What the declaration asks of one organization variable. */
export interface OrgVariable {
	value: string;
	visibility: "all" | "private";
}

/** GitHub's rule for a variable name: letters, digits and underscores, not starting with a digit or `GITHUB_`. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertNames(names: string[]): void {
	for (const name of names) {
		if (!NAME.test(name) || name.toUpperCase().startsWith("GITHUB_")) {
			throw new Error(
				`invalid variable name ${JSON.stringify(name)}: use letters, digits and underscores, not starting with a digit or GITHUB_`
			);
		}
	}
}

interface Change {
	name: string;
	/** The body that creates it or brings it in line. */
	body: Record<string, unknown>;
	/** Whether it has to be changed at all. */
	differs: boolean;
}

/**
 * Bring one scope's variables in line with the declaration: create what is missing, update what differs, leave what
 * already matches. Variables that exist but are not declared are left alone, or deleted with `prune`. Returns a
 * one-line summary, naming the undeclared ones that were left so drift is visible.
 */
async function reconcile(
	client: GitHubClient,
	repo: string,
	scope: VariableScope,
	wanted: Array<{ name: string; value: string; visibility?: "all" | "private" }>,
	prune: boolean
): Promise<string> {
	assertNames(wanted.map((w) => w.name));
	const existing = new Map((await client.variables.listVariables(repo, scope)).map((v) => [v.name, v]));
	const counts = { created: 0, updated: 0, unchanged: 0, deleted: 0 };

	for (const want of wanted) {
		const have = existing.get(want.name);
		const body: Change["body"] = { name: want.name, value: want.value };
		if (want.visibility) body["visibility"] = want.visibility;
		if (!have) {
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
		await client.variables.updateVariable(repo, scope, want.name, body);
		counts.updated++;
	}

	const declared = new Set(wanted.map((w) => w.name));
	const undeclared = [...existing.keys()].filter((name) => !declared.has(name));
	if (prune) {
		for (const name of undeclared) {
			await client.variables.deleteVariable(repo, scope, name);
			counts.deleted++;
		}
	}

	const parts = [`${counts.created} created`, `${counts.updated} updated`, `${counts.unchanged} unchanged`];
	if (counts.deleted > 0) parts.push(`${counts.deleted} deleted`);
	if (!prune && undeclared.length > 0)
		parts.push(`${undeclared.length} not declared, left alone: ${undeclared.join(", ")}`);
	return parts.join(", ");
}

/** Reconcile a repository's Actions variables. */
export function syncVariables(
	client: GitHubClient,
	repo: string,
	variables: Record<string, string>,
	opts: { prune?: boolean } = {}
): Promise<string> {
	const wanted = Object.entries(variables).map(([name, value]) => ({ name, value }));
	return reconcile(client, repo, { kind: "repo" }, wanted, opts.prune === true);
}

/** Reconcile an organization's Actions variables. `repo` is only the coordinate the client is bound to. */
export function syncOrgVariables(
	client: GitHubClient,
	repo: string,
	org: string,
	variables: Record<string, OrgVariable>,
	opts: { prune?: boolean } = {}
): Promise<string> {
	const wanted = Object.entries(variables).map(([name, v]) => ({ name, value: v.value, visibility: v.visibility }));
	return reconcile(client, repo, { kind: "organization", org }, wanted, opts.prune === true);
}
