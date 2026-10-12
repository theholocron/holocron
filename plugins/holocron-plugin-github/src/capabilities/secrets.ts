import type { Secrets, SecretScope } from "@theholocron/cli";
import type { GitHubClient, SecretScope as GHSecretScope } from "@theholocron/github-client";

import { encryptSecret } from "../sodium.js";

export interface SecretsOptions {
	repo: string;
}

export class GitHubSecrets implements Secrets {
	readonly key = "secrets" as const;
	readonly providerName = "github";

	constructor(
		private readonly client: GitHubClient,
		private readonly opts: SecretsOptions
	) {}

	async listSecrets(scope: SecretScope): Promise<string[]> {
		return this.client.secrets.listSecrets(this.opts.repo, toGHScope(scope));
	}

	async setSecret(scope: SecretScope, name: string, value: string): Promise<void> {
		const ghScope = toGHScope(scope);
		const pk = await this.client.secrets.getPublicKey(this.opts.repo, ghScope);
		const encryptedValue = await encryptSecret(pk.key, value);
		const body: Record<string, unknown> = { encrypted_value: encryptedValue, key_id: pk.key_id };
		if (scope.kind === "organization") body.visibility = "all";
		await this.client.secrets.putSecret(this.opts.repo, ghScope, name, body);
	}

	async deleteSecret(scope: SecretScope, name: string): Promise<void> {
		await this.client.secrets.deleteSecret(this.opts.repo, toGHScope(scope), name);
	}
}

function toGHScope(scope: SecretScope): GHSecretScope {
	if (scope.kind === "organization") return { kind: "organization", org: scope.name };
	return scope;
}
