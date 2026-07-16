import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export type SecretScope =
	| { kind: "repo" }
	| { kind: "environment"; name: string }
	| { kind: "organization"; org: string };

export interface GitHubPublicKey {
	key_id: string;
	key: string;
}

interface SecretsListResponse {
	total_count: number;
	secrets: Array<{ name: string }>;
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
				.request<SecretsListResponse>(
					`${scopeBase(repo, scope)}/secrets`,
				)
				.then((r: SecretsListResponse) =>
					r.secrets.map((s: { name: string }) => s.name),
				),

		getPublicKey: (
			repo: string,
			scope: SecretScope,
		): Promise<GitHubPublicKey> =>
			rest.request<GitHubPublicKey>(
				`${scopeBase(repo, scope)}/secrets/public-key`,
			),

		putSecret: (
			repo: string,
			scope: SecretScope,
			name: string,
			body: Record<string, unknown>,
		): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/secrets/${name}`, {
				method: "PUT",
				body,
				expectNoContent: true,
			}),

		deleteSecret: (
			repo: string,
			scope: SecretScope,
			name: string,
		): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/secrets/${name}`, {
				method: "DELETE",
				expectNoContent: true,
			}),
	};
}
