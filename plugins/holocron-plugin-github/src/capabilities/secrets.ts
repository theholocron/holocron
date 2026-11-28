import type { OrganizationSecretScope, SecretAccess, Secrets, SecretScope } from "@theholocron/cli";
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

	/** Repository name to numeric id, so one run asks GitHub once per repository however many secrets name it. */
	private readonly repoIds = new Map<string, Promise<number>>();

	private clientFor(scope: SecretScope): GitHubClient {
		return scope.kind === "organization" ? (this.orgClient ?? this.client) : this.client;
	}

	async listSecrets(scope: SecretScope): Promise<string[]> {
		return this.clientFor(scope).secrets.listSecrets(this.opts.repo, toGHScope(scope));
	}

	async setSecret(scope: SecretScope, name: string, value: string): Promise<void> {
		const ghScope = toGHScope(scope);
		const client = this.clientFor(scope);
		// Resolve the readers first: a name that does not resolve writes nothing.
		const readers = scope.kind === "organization" ? await this.readers(scope) : {};
		const pk = await client.secrets.getPublicKey(this.opts.repo, ghScope);
		const encryptedValue = await encryptSecret(pk.key, value);
		const body: Record<string, unknown> = { encrypted_value: encryptedValue, key_id: pk.key_id };
		Object.assign(body, readers);
		await client.secrets.putSecret(this.opts.repo, ghScope, name, body);
	}

	/**
	 * Who can read each organization secret, by name (never a value): `selected` ones come with the names of their
	 * repositories. Any other scope has no visibility and gives `{}`.
	 */
	async listSecretAccess(scope: SecretScope): Promise<Record<string, SecretAccess>> {
		if (scope.kind !== "organization") return {};
		const client = this.clientFor(scope);
		const found: Record<string, SecretAccess> = {};
		for (const info of await client.secrets.listOrgSecretInfo(scope.name)) {
			found[info.name] =
				info.visibility === "selected"
					? {
							visibility: "selected",
							repos: await client.secrets.listSelectedRepositories(scope.name, info.name),
						}
					: { visibility: info.visibility };
		}
		return found;
	}

	/** The `visibility` (and repository ids) of an organization write. No `visibility` keeps the older default, `all`. */
	private async readers(scope: OrganizationSecretScope): Promise<Record<string, unknown>> {
		const visibility = scope.visibility ?? "all";
		if (visibility !== "selected") return { visibility };
		if (!scope.repos?.length) {
			throw new Error(`organization secret with visibility "selected" needs a non-empty repos list`);
		}
		const ids: number[] = [];
		for (const name of scope.repos) ids.push(await this.repoId(scope.name, name));
		return { visibility, selected_repository_ids: ids };
	}

	private repoId(org: string, name: string): Promise<number> {
		const full = `${org}/${name}`;
		let id = this.repoIds.get(full);
		if (!id) {
			id = this.client.repos.getRepo(full).then(
				(repo) => repo.id,
				(err: unknown) => {
					throw new Error(
						`could not resolve repository ${full}: ${err instanceof Error ? err.message : String(err)}`
					);
				}
			);
			this.repoIds.set(full, id);
		}
		return id;
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
