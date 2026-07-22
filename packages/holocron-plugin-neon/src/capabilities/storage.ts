/**
 * `storage` capability for Neon.
 *
 * Ported from rando-id/rando.id `adapters/neon.ts`, bound to a single
 * Neon project (the `projectId` plugin option). All methods operate
 * within that project.
 *
 * Branch ops use Neon's REST API directly. `enableExtension` runs SQL
 * against the branch's default database via the `run_sql` endpoint —
 * Neon doesn't have a dedicated "create extension" endpoint, so this
 * goes through SQL.
 *
 * Project-create is deliberately omitted: Vercel-managed Neon orgs
 * reject create at the API level, and the recipe (`vercel install neon`
 * → wait for project to appear → bind by id) is unavoidable for those
 * setups. The plugin assumes the project already exists and is bound
 * via `projectId` in options.
 */

import { ProviderApiError } from "@theholocron/cli";
import type { ConnectionStringOptions, Storage, StorageBranch } from "@theholocron/cli";
import type { NeonBranch, NeonClient, NeonDatabase } from "@theholocron/neon-client";

export interface StorageOptions {
	projectId: string;
}

export class NeonStorage implements Storage {
	readonly key = "storage" as const;
	readonly providerName = "neon";

	constructor(
		private readonly client: NeonClient,
		private readonly opts: StorageOptions
	) {
		if (!opts.projectId) {
			throw new Error("NeonStorage requires `projectId` in options");
		}
	}

	// ── connection string ───────────────────────────────────────────────

	async getConnectionString(scope: string, options: ConnectionStringOptions = {}): Promise<string> {
		const db = await this.firstDatabase(scope);
		const { uri } = await this.client.connection.uri(this.opts.projectId, {
			branch_id: scope,
			database_name: db.name,
			role_name: db.owner_name,
			pooled: options.pooled ? "true" : "false",
		});
		return uri;
	}

	// ── branch ops ──────────────────────────────────────────────────────

	async listBranches(): Promise<StorageBranch[]> {
		const { branches } = await this.client.branches.list(this.opts.projectId);
		return branches.map(mapBranch);
	}

	async createBranch(input: { name: string; from?: string }): Promise<StorageBranch> {
		// Provision a read_write endpoint inline. Without it, /connection_uri
		// returns "endpoint not found" on a freshly-created branch.
		const { branch } = await this.client.branches.create(this.opts.projectId, {
			name: input.name,
			...(input.from ? { parent_id: input.from } : {}),
			endpoints: [{ type: "read_write" }],
		});
		return mapBranch(branch);
	}

	async destroyBranch(branch: string): Promise<void> {
		await this.client.branches.destroy(this.opts.projectId, branch);
	}

	async resetBranch(input: { branch: string; from: string }): Promise<void> {
		// Neon's "Restore branch" endpoint resets the target branch to match
		// the state of another branch. Reversible via Neon's auto-backup.
		await this.client.branches.restore(this.opts.projectId, input.branch, input.from);
	}

	async enableExtension(input: { branch: string; extension: string }): Promise<void> {
		const db = await this.firstDatabase(input.branch);
		await this.client.databases.runSql(
			this.opts.projectId,
			input.branch,
			db.name,
			`CREATE EXTENSION IF NOT EXISTS "${input.extension}"`
		);
	}

	// ── internals ───────────────────────────────────────────────────────

	/**
	 * The first database on a branch — the "default" for connection-string
	 * and extension purposes. Throws if the branch has no databases (which
	 * means it was created without an endpoint and needs initialization).
	 */
	private async firstDatabase(branchId: string): Promise<NeonDatabase> {
		const { databases } = await this.client.databases.list(this.opts.projectId, branchId);
		const db = databases[0];
		if (!db) {
			throw new ProviderApiError(
				`Neon branch ${branchId} has no databases — initialize the branch first`,
				404,
				undefined
			);
		}
		return db;
	}
}

function mapBranch(raw: NeonBranch): StorageBranch {
	return {
		id: raw.id,
		name: raw.name,
		parentId: raw.parent_id ?? null,
		createdAt: raw.created_at,
	};
}
