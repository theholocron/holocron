import type { CheckRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import type { Secrets, SecretScope, Source } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import type { NameSource } from "./doctor-variable-owners.type.js";
import { feedKey } from "./feed-key.js";

/** What reading GitHub gave: the names each place holds, and a skipped row for each that could not be read. */
export interface GitHubReads {
	sources: NameSource[];
	rows: CheckRow[];
}

/** The names a place holds, or why it was not read. */
type Listed = string[] | { skip: string };

/** What {@link readGitHub} reads from. A missing provider is the reason it is missing. */
export interface GitHubProviders {
	/** The `secrets` provider, or why there is none. */
	secrets: Secrets | { why: string };
	/** The `source` provider, or why there is none. */
	source: Source | { why: string };
	/** The organization, or undefined when the config and the repository name none. */
	org: string | undefined;
	/** The GitHub Environments whose secrets to list. */
	environments: string[];
}

/**
 * Reads the names of the Actions secrets (repository, organization and each Environment) and variables (repository and
 * organization) through the `secrets` and `source` providers. GitHub never returns a secret's value, and the variables'
 * values the provider returns are dropped at once. A place that cannot be read (no provider, the provider cannot
 * list it, no token, an error) is a skipped row with the reason, never a failure.
 */
export async function readGitHub(input: GitHubProviders): Promise<GitHubReads> {
	const sources: NameSource[] = [];
	const rows: CheckRow[] = [];
	const skip = (id: string, label: string, detail: string) =>
		rows.push({ id: `skip:${id}`, title: label, status: "skip", detail, problems: [] });
	const read = async (id: string, label: string, feed: string, list: () => Promise<Listed>) => {
		try {
			const names = await list();
			if ("skip" in names) skip(id, label, names.skip);
			else sources.push({ label, group: `github:${feed}`, names, feed });
		} catch (err) {
			skip(id, label, missingTokenReason(err) ?? `could not read it: ${describeError(err)}`);
		}
	};
	const secrets = (scope: SecretScope) => async (): Promise<Listed> =>
		"why" in input.secrets ? { skip: input.secrets.why } : input.secrets.listSecrets(scope);
	const noOrg = "no organization: set `org` in the config or run inside a repository";
	const org = input.org;

	await read("repo-secrets", "repository secrets", feedKey("secrets", { kind: "repo" }), secrets({ kind: "repo" }));
	if (org === undefined) {
		skip("org-secrets", "organization secrets", noOrg);
		skip("org-variables", "organization variables", noOrg);
	} else {
		const scope: SecretScope = { kind: "organization", name: org };
		await read("org-secrets", "organization secrets", feedKey("secrets", scope), secrets(scope));
	}
	for (const name of input.environments) {
		const scope: SecretScope = { kind: "environment", name };
		await read(`env-secrets-${name}`, `${name} environment secrets`, feedKey("secrets", scope), secrets(scope));
	}

	const source = input.source;
	await read("repo-variables", "repository variables", feedKey("variables", { kind: "repo" }), async () => {
		if ("why" in source) return { skip: source.why };
		if (!source.listVariables) return { skip: "the `source` provider cannot list variables" };
		return Object.keys(await source.listVariables());
	});
	if (org !== undefined) {
		await read(
			"org-variables",
			"organization variables",
			feedKey("variables", { kind: "organization", name: org }),
			async () => {
				if ("why" in source) return { skip: source.why };
				if (!source.listOrgVariables)
					return { skip: "the `source` provider cannot list organization variables" };
				return Object.keys(await source.listOrgVariables(org));
			}
		);
	}
	return { sources, rows };
}
