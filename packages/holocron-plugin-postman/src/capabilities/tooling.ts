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

import type { RestClient } from "@theholocron/cli";

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

// ── Domain shapes (vendor-specific) ──────────────────────────────────

export interface PostmanUser {
	id: number;
	username: string;
	fullName: string;
}

export interface PostmanWorkspace {
	id: string;
	name: string;
	type: string;
}

export interface PostmanCollection {
	id: string;
	uid: string;
	name: string;
}

export interface PostmanEnvironment {
	id: string;
	uid: string;
	name: string;
}

export interface PostmanSpec {
	id: string;
	name: string;
	type: string;
}

// ── Raw response shapes (narrow — only fields we read) ───────────────

interface RawUser {
	id: number;
	username: string;
	fullName: string;
}

interface RawWorkspace {
	id: string;
	name: string;
	type: string;
}

interface RawCollection {
	id: string;
	uid: string;
	name: string;
}

interface RawEnvironment {
	id: string;
	uid: string;
	name: string;
}

interface RawSpec {
	id: string;
	name: string;
	type: string;
}

// ── Implementation ──────────────────────────────────────────────────

export class PostmanTooling implements Tooling {
	readonly key = "tooling" as const;
	readonly providerName = "postman";

	private readonly opts: PostmanToolingOptions;
	private readonly repoRoot: string;

	constructor(
		private readonly rest: RestClient,
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

		// 1. Spec Hub — find-or-create, then PATCH the file content.
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

		// 2. Collection — delete-then-import (Postman's OpenAPI import is
		// create-only; no stable-id update path).
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

		// 3. Environments — find-or-create for each file.
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
		const raw = await this.rest.request<{ user: RawUser }>("/me");
		return { id: raw.user.id, username: raw.user.username, fullName: raw.user.fullName };
	}

	async listWorkspaces(): Promise<PostmanWorkspace[]> {
		const raw = await this.rest.request<{ workspaces: RawWorkspace[] }>("/workspaces");
		return raw.workspaces.map((w) => ({ id: w.id, name: w.name, type: w.type }));
	}

	async findCollectionByName(input: { workspaceId: string; name: string }): Promise<PostmanCollection | null> {
		const raw = await this.rest.request<{ collections: RawCollection[] }>("/collections", {
			query: { workspace: input.workspaceId },
		});
		const match = raw.collections.find((c) => c.name === input.name);
		return match ? { id: match.id, uid: match.uid, name: match.name } : null;
	}

	async deleteCollection(uid: string): Promise<void> {
		await this.rest.request<void>(`/collections/${encodeURIComponent(uid)}`, {
			method: "DELETE",
		});
	}

	async importOpenApi(input: { workspaceId: string; spec: unknown }): Promise<PostmanCollection> {
		const raw = await this.rest.request<{ collections: RawCollection[] }>("/import/openapi", {
			method: "POST",
			query: { workspace: input.workspaceId },
			body: {
				type: "string",
				input: typeof input.spec === "string" ? input.spec : JSON.stringify(input.spec),
			},
		});
		const created = raw.collections[0];
		if (!created) {
			throw new ProviderApiError(
				"Postman returned no collection on import — check the OpenAPI spec is well-formed",
				500,
				undefined
			);
		}
		return { id: created.id, uid: created.uid, name: created.name };
	}

	async listEnvironments(input: { workspaceId: string }): Promise<PostmanEnvironment[]> {
		const raw = await this.rest.request<{ environments: RawEnvironment[] }>("/environments", {
			query: { workspace: input.workspaceId },
		});
		return raw.environments.map((e) => ({ id: e.id, uid: e.uid, name: e.name }));
	}

	async findEnvironmentByName(input: { workspaceId: string; name: string }): Promise<PostmanEnvironment | null> {
		const envs = await this.listEnvironments(input);
		return envs.find((e) => e.name === input.name) ?? null;
	}

	async createEnvironment(input: { workspaceId: string; environment: unknown }): Promise<PostmanEnvironment> {
		const raw = await this.rest.request<{ environment: RawEnvironment }>("/environments", {
			method: "POST",
			query: { workspace: input.workspaceId },
			body: { environment: input.environment },
		});
		return { id: raw.environment.id, uid: raw.environment.uid, name: raw.environment.name };
	}

	async updateEnvironment(input: { uid: string; environment: unknown }): Promise<PostmanEnvironment> {
		const raw = await this.rest.request<{ environment: RawEnvironment }>(
			`/environments/${encodeURIComponent(input.uid)}`,
			{ method: "PUT", body: { environment: input.environment } }
		);
		return { id: raw.environment.id, uid: raw.environment.uid, name: raw.environment.name };
	}

	async findSpecByName(input: { workspaceId: string; name: string }): Promise<PostmanSpec | null> {
		const raw = await this.rest.request<{ specs: RawSpec[] }>("/specs", {
			query: { workspaceId: input.workspaceId },
		});
		const match = raw.specs.find((s) => s.name === input.name);
		return match ? { id: match.id, name: match.name, type: match.type } : null;
	}

	async createSpec(input: {
		workspaceId: string;
		name: string;
		type?: string;
		filePath?: string;
		fileContent: string;
	}): Promise<PostmanSpec> {
		// Body shape verified empirically — name + type are flat (not
		// wrapped under `spec`); files is an array of `{ path, content }`.
		const raw = await this.rest.request<RawSpec>("/specs", {
			method: "POST",
			query: { workspaceId: input.workspaceId },
			body: {
				name: input.name,
				type: input.type ?? "OPENAPI:3.0",
				files: [{ path: input.filePath ?? "index.json", content: input.fileContent }],
			},
		});
		return { id: raw.id, name: raw.name, type: raw.type };
	}

	async upsertSpecFile(input: { specId: string; filePath: string; content: string }): Promise<void> {
		// PATCH (PUT returns 404 against this surface — verified empirically).
		await this.rest.request<void>(
			`/specs/${encodeURIComponent(input.specId)}/files/${encodeURIComponent(input.filePath)}`,
			{ method: "PATCH", body: { content: input.content } }
		);
	}
}
