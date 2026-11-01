import type { Secrets, SecretScope } from "@theholocron/cli";
import type { GitHubClient, SecretScope as GHSecretScope } from "@theholocron/github-client";

import { encryptSecret } from "../sodium.js";

export interface SecretsOptions {
	repo: string;
}

/** The GitHub implementation of the `secrets` capability, covering repository, environment and organization secrets. */
export class GitHubSecrets implements Secrets {
	/** Capability key, always `"secrets"`. */
	readonly key = "secrets" as const;
	/** Provider name, always `"github"`. */
	readonly providerName = "github";

	/**
	 * `client` handles repo and environment scopes; `orgClient`, when given, handles
	 * the organization scope. They differ when a dedicated org-only token exists:
	 * it can write org secrets but not repo ones, and `github.admin` is the reverse.
	 */
	constructor(
		private readonly client: GitHubClient,
		private readonly opts: SecretsOptions,
		private readonly orgClient?: GitHubClient
	) {}

	private clientFor(scope: SecretScope): GitHubClient {
		return scope.kind === "organization" ? (this.orgClient ?? this.client) : this.client;
	}

	async listSecrets(scope: SecretScope): Promise<string[]> {
		return this.clientFor(scope).secrets.listSecrets(this.opts.repo, toGHScope(scope));
	}

	async setSecret(scope: SecretScope, name: string, value: string): Promise<void> {
		const ghScope = toGHScope(scope);
		const client = this.clientFor(scope);
		const pk = await client.secrets.getPublicKey(this.opts.repo, ghScope);
		const encryptedValue = await encryptSecret(pk.key, value);
		const body: Record<string, unknown> = { encrypted_value: encryptedValue, key_id: pk.key_id };
		if (scope.kind === "organization") body.visibility = "all";
		await client.secrets.putSecret(this.opts.repo, ghScope, name, body);
	}

	/** Deletes the named secret in the given scope. */
	async deleteSecret(scope: SecretScope, name: string): Promise<void> {
		await this.clientFor(scope).secrets.deleteSecret(this.opts.repo, toGHScope(scope), name);
	}
}

function toGHScope(scope: SecretScope): GHSecretScope {
	if (scope.kind === "organization") return { kind: "organization", org: scope.name };
	return scope;
}
