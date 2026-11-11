import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** Where a secret lives: the repository, one of its environments, or an organization. */
export type SecretScope =
	{ kind: "repo" } | { kind: "environment"; name: string } | { kind: "organization"; org: string };

/** A public key used to encrypt a secret before it is sent. */
export interface GitHubPublicKey {
	/** The key's id, sent back with the encrypted secret. */
	key_id: string;
	/** The Base64-encoded public key. */
	key: string;
}

interface SecretsListResponse {
	total_count: number;
	secrets: Array<{ name: string }>;
}

/** Who can read an organization secret: every repository, every private one, or the ones listed. */
export type OrgSecretVisibility = "all" | "private" | "selected";

/** An organization secret as the list returns it: its name and who can read it (never its value). */
export interface OrgSecretInfo {
	/** The secret's name. */
	name: string;
	/** Who can read it. */
	visibility: OrgSecretVisibility;
}

interface OrgSecretsListResponse {
	total_count: number;
	secrets: OrgSecretInfo[];
}

interface SelectedReposResponse {
	total_count: number;
	repositories: Array<{ name: string }>;
}

function scopeBase(repo: string, scope: SecretScope): string {
	switch (scope.kind) {
		case "repo":
			return `${repoBase(repo)}/actions`;
		case "environment":
			return `${repoBase(repo)}/environments/${scope.name}`;
		case "organization":
			return `/orgs/${scope.org}/actions`;
	}
}

export function secrets(rest: RestClient) {
	return {
		listSecrets: (repo: string, scope: SecretScope): Promise<string[]> =>
			rest
				.request<SecretsListResponse>(`${scopeBase(repo, scope)}/secrets`)
				.then((r: SecretsListResponse) => r.secrets.map((s: { name: string }) => s.name)),

		/** The organization's secrets with their visibility, names only (first 100). */
		listOrgSecretInfo: (org: string): Promise<OrgSecretInfo[]> =>
			rest
				.request<OrgSecretsListResponse>(`/orgs/${org}/actions/secrets?per_page=100`)
				.then((r: OrgSecretsListResponse) =>
					r.secrets.map((s: OrgSecretInfo) => ({ name: s.name, visibility: s.visibility }))
				),

		/** The names of the repositories that can read one organization secret of visibility `selected` (first 100). */
		listSelectedRepositories: (org: string, name: string): Promise<string[]> =>
			rest
				.request<SelectedReposResponse>(`/orgs/${org}/actions/secrets/${name}/repositories?per_page=100`)
				.then((r: SelectedReposResponse) => r.repositories.map((repo: { name: string }) => repo.name)),

		getPublicKey: (repo: string, scope: SecretScope): Promise<GitHubPublicKey> =>
			rest.request<GitHubPublicKey>(`${scopeBase(repo, scope)}/secrets/public-key`),

		putSecret: (repo: string, scope: SecretScope, name: string, body: Record<string, unknown>): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/secrets/${name}`, {
				method: "PUT",
				body,
				expectNoContent: true,
			}),

		deleteSecret: (repo: string, scope: SecretScope, name: string): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/secrets/${name}`, {
				method: "DELETE",
				expectNoContent: true,
			}),
	};
}
