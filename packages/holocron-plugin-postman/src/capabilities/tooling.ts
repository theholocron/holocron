/**
 * `tooling` capability for Postman.
 *
 * Ported from rando-id/rando.id `adapters/postman.ts`. The holocron
 * `Tooling` interface stays narrow (`sync` + `doctor`); the
 * Postman-specific surface (workspaces, collections, environments,
 * Spec Hub) lives as additional methods on this class for callers
 * that need direct access.
 *
 * `sync()` flow:
 *   1. Read the local OpenAPI spec from `options.specFile`
 *   2. Find or create the Spec Hub spec by name in the workspace;
 *      upsert the spec file content
 *   3. Find any existing collection with the same name and delete it
 *      (Postman's import-from-OpenAPI path is create-only — no stable
 *      update path for collections produced from a spec)
 *   4. Import the spec as a fresh collection
 *   5. For each `envFiles[i]`, find-or-create the environment
 *
 * `doctor()` probes `/me` for auth + `/workspaces` for workspace
 * reachability and returns a `ToolingDoctorReport`.
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { ProviderApiError } from "@theholocron/cli";
import type { Tooling, ToolingDoctorReport } from "@theholocron/cli";
import type {
	PostmanClient,
	PostmanCollection,
	PostmanEnvironment,
	PostmanSpec,
	PostmanUser,
	PostmanWorkspace,
} from "@theholocron/postman-client";

export interface PostmanToolingOptions {
	workspaceId: string;
	/** Local OpenAPI JSON path (relative to repoRoot). */
	specFile?: string;
	/** Display name in Postman. Defaults to the OpenAPI spec's `info.title`. */
	specName?: string;
	/** Collection name to import the spec as. Defaults to specName. */
	collectionName?: string;
	/** Local Postman environment JSON files to push (relative to repoRoot). */
	envFiles?: string[];
	/** Working repo root. Defaults to process.cwd(). */
	repoRoot?: string;
}

export class PostmanTooling implements Tooling {
	readonly key = "tooling" as const;
	readonly providerName = "postman";

	private readonly opts: PostmanToolingOptions;
	private readonly repoRoot: string;

	constructor(
		private readonly client: PostmanClient,
		opts: PostmanToolingOptions
	) {
		if (!opts.workspaceId) {
			throw new Error("PostmanTooling requires `workspaceId` in options");
		}
		this.opts = opts;
		this.repoRoot = opts.repoRoot ?? process.cwd();
	}

	// ── Tooling interface ──────────────────────────────────────────────

	async sync(): Promise<void> {
		if (!this.opts.specFile) {
			throw new Error("PostmanTooling.sync() requires `specFile` in options (local OpenAPI JSON path)");
		}

		const specPath = resolve(this.repoRoot, this.opts.specFile);
		const specText = await readFile(specPath, "utf8");
		const specObj = JSON.parse(specText) as { info?: { title?: string } };
		const inferredName = specObj.info?.title ?? basename(specPath);
		const specName = this.opts.specName ?? inferredName;
		const collectionName = this.opts.collectionName ?? specName;

		const existingSpec = await this.findSpecByName({
			workspaceId: this.opts.workspaceId,
			name: specName,
		});
		if (existingSpec) {
			await this.upsertSpecFile({
				specId: existingSpec.id,
				filePath: "index.json",
				content: specText,
			});
		} else {
			await this.createSpec({
				workspaceId: this.opts.workspaceId,
				name: specName,
				fileContent: specText,
			});
		}

		const existingCollection = await this.findCollectionByName({
			workspaceId: this.opts.workspaceId,
			name: collectionName,
		});
		if (existingCollection) {
			await this.deleteCollection(existingCollection.uid);
		}
		await this.importOpenApi({
			workspaceId: this.opts.workspaceId,
			spec: specObj,
		});

		for (const file of this.opts.envFiles ?? []) {
			const envPath = resolve(this.repoRoot, file);
			const envText = await readFile(envPath, "utf8");
			const envObj = JSON.parse(envText) as { name?: string };
			if (!envObj.name) {
				throw new Error(`Postman environment file ${file} is missing a "name" field`);
			}
			const existing = await this.findEnvironmentByName({
				workspaceId: this.opts.workspaceId,
				name: envObj.name,
			});
			if (existing) {
				await this.updateEnvironment({ uid: existing.uid, environment: envObj });
			} else {
				await this.createEnvironment({ workspaceId: this.opts.workspaceId, environment: envObj });
			}
		}
	}

	async doctor(): Promise<ToolingDoctorReport> {
		try {
			const me = await this.getMyself();
			const workspaces = await this.listWorkspaces();
			const found = workspaces.find((w) => w.id === this.opts.workspaceId);
			if (!found) {
				return {
					ok: false,
					message: `authed as ${me.username}, but workspace ${this.opts.workspaceId} not visible`,
				};
			}
			return {
				ok: true,
				message: `authed as ${me.username}; workspace ${found.name} (${found.type}) accessible`,
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// ── Postman-specific methods ───────────────────────────────────────

	async getMyself(): Promise<PostmanUser> {
		const res = await this.client.me.get();
		return res.user ?? {};
	}

	async listWorkspaces(): Promise<PostmanWorkspace[]> {
		const { workspaces } = await this.client.workspaces.list();
		return workspaces;
	}

	async findCollectionByName(input: { workspaceId: string; name: string }): Promise<PostmanCollection | null> {
		const { collections } = await this.client.collections.list(input.workspaceId);
		return collections.find((c) => c.name === input.name) ?? null;
	}

	async deleteCollection(uid: string): Promise<void> {
		await this.client.collections.delete(uid);
	}

	async importOpenApi(input: { workspaceId: string; spec: unknown }): Promise<PostmanCollection> {
		const { collections } = await this.client.import.openapi(input.workspaceId, input.spec);
		const created = collections[0];
		if (!created) {
			throw new ProviderApiError(
				"Postman returned no collection on import — check the OpenAPI spec is well-formed",
				500,
				undefined
			);
		}
		return created;
	}

	async listEnvironments(input: { workspaceId: string }): Promise<PostmanEnvironment[]> {
		const { environments } = await this.client.environments.list(input.workspaceId);
		return environments;
	}

	async findEnvironmentByName(input: { workspaceId: string; name: string }): Promise<PostmanEnvironment | null> {
		const envs = await this.listEnvironments(input);
		return envs.find((e) => e.name === input.name) ?? null;
	}

	async createEnvironment(input: { workspaceId: string; environment: unknown }): Promise<PostmanEnvironment> {
		const { environment } = await this.client.environments.create(input.workspaceId, input.environment);
		return environment;
	}

	async updateEnvironment(input: { uid: string; environment: unknown }): Promise<PostmanEnvironment> {
		const { environment } = await this.client.environments.update(input.uid, input.environment);
		return environment;
	}

	async findSpecByName(input: { workspaceId: string; name: string }): Promise<PostmanSpec | null> {
		const { specs } = await this.client.specs.list(input.workspaceId);
		return specs.find((s) => s.name === input.name) ?? null;
	}

	async createSpec(input: {
		workspaceId: string;
		name: string;
		type?: string;
		filePath?: string;
		fileContent: string;
	}): Promise<PostmanSpec> {
		return this.client.specs.create(input.workspaceId, {
			name: input.name,
			type: input.type,
			filePath: input.filePath,
			fileContent: input.fileContent,
		});
	}

	async upsertSpecFile(input: { specId: string; filePath: string; content: string }): Promise<void> {
		await this.client.specs.updateFile(input.specId, input.filePath, input.content);
	}
}
