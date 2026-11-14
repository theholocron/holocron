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
 *   5. For each `collectionFiles[i]`, find the collection by `info.name` and replace it, or create it
 *   6. For each `envFiles[i]`, find-or-create the environment; a secret the file leaves empty keeps the value
 *      the environment already holds
 *
 * The workspace is `workspaceId` when given, else the one named `workspace`, made (type `workspaceType`,
 * default `personal`) when it does not exist. `doctor()` never makes it.
 *
 * `doctor()` probes `/me` for auth + `/workspaces` for workspace
 * reachability and returns a `ToolingDoctorReport`.
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { Tooling, ToolingDoctorReport } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";
import type {
	PostmanClient,
	PostmanCollection,
	PostmanEnvironment,
	PostmanEnvironmentValue,
	PostmanSpec,
	PostmanUser,
	PostmanWorkspace,
} from "@theholocron/postman-client";

export interface PostmanToolingOptions {
	/** Postman workspace id. Wins over `workspace`. */
	workspaceId?: string;
	/** Workspace name; found, or made on `sync()` when no workspace has it. */
	workspace?: string;
	/** Type of a workspace `sync()` makes. Defaults to `personal`. */
	workspaceType?: "personal" | "team";
	/** Local Postman collection JSON files to push (relative to repoRoot), matched to Postman's by `info.name`. */
	collectionFiles?: string[];
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

/** The Postman implementation of the `tooling` capability: syncs an OpenAPI spec, collection and environments into a workspace. */
export class PostmanTooling implements Tooling {
	/** The capability this class provides, always `"tooling"`. */
	readonly key = "tooling" as const;
	/** The provider name, `"postman"`. */
	readonly providerName = "postman";

	private readonly opts: PostmanToolingOptions;
	private readonly repoRoot: string;
	private workspaceIdPromise: Promise<string> | undefined;

	constructor(
		private readonly client: () => PostmanClient,
		opts: PostmanToolingOptions
	) {
		if (!opts.workspaceId && !opts.workspace) {
			throw new Error("PostmanTooling requires `workspaceId` or `workspace` in options");
		}
		this.opts = opts;
		this.repoRoot = opts.repoRoot ?? process.cwd();
	}

	// ── Tooling interface ──────────────────────────────────────────────

	async sync(): Promise<void> {
		const { specFile, collectionFiles = [], envFiles = [] } = this.opts;
		if (!specFile && collectionFiles.length === 0 && envFiles.length === 0) {
			throw new Error(
				"PostmanTooling.sync() requires `specFile` (local OpenAPI JSON path), `collectionFiles` or `envFiles` in options"
			);
		}
		const workspaceId = await this.resolveWorkspaceId();

		if (specFile) await this.syncSpec(workspaceId, specFile);
		for (const file of collectionFiles) await this.syncCollectionFile(workspaceId, file);
		for (const file of envFiles) await this.syncEnvironmentFile(workspaceId, file);
	}

	private async syncSpec(workspaceId: string, specFile: string): Promise<void> {
		const specPath = resolve(this.repoRoot, specFile);
		const specText = await readFile(specPath, "utf8");
		const specObj = JSON.parse(specText) as { info?: { title?: string } };
		const inferredName = specObj.info?.title ?? basename(specPath);
		const specName = this.opts.specName ?? inferredName;
		const collectionName = this.opts.collectionName ?? specName;

		const existingSpec = await this.findSpecByName({ workspaceId, name: specName });
		if (existingSpec) {
			await this.upsertSpecFile({
				specId: existingSpec.id,
				filePath: "index.json",
				content: specText,
			});
		} else {
			await this.createSpec({ workspaceId, name: specName, fileContent: specText });
		}

		const existingCollection = await this.findCollectionByName({ workspaceId, name: collectionName });
		if (existingCollection) {
			await this.deleteCollection(existingCollection.uid);
		}
		await this.importOpenApi({ workspaceId, spec: specObj });
	}

	private async syncCollectionFile(workspaceId: string, file: string): Promise<void> {
		const collection = JSON.parse(await readFile(resolve(this.repoRoot, file), "utf8")) as {
			info?: { name?: string };
		};
		const name = collection.info?.name;
		if (!name) {
			throw new Error(`Postman collection file ${file} is missing \`info.name\``);
		}
		const existing = await this.findCollectionByName({ workspaceId, name });
		if (existing) {
			await this.updateCollection({ uid: existing.uid, collection });
		} else {
			await this.createCollection({ workspaceId, collection });
		}
	}

	private async syncEnvironmentFile(workspaceId: string, file: string): Promise<void> {
		const envText = await readFile(resolve(this.repoRoot, file), "utf8");
		const envObj = JSON.parse(envText) as { name?: string; values?: PostmanEnvironmentValue[] };
		if (!envObj.name) {
			throw new Error(`Postman environment file ${file} is missing a "name" field`);
		}
		const existing = await this.findEnvironmentByName({ workspaceId, name: envObj.name });
		if (!existing) {
			await this.createEnvironment({ workspaceId, environment: envObj });
			return;
		}
		const values = envObj.values ?? [];
		const environment = values.some((v) => v.type === "secret" && !v.value)
			? { ...envObj, values: keepSecrets(values, (await this.getEnvironment(existing.uid)).values ?? []) }
			: envObj;
		await this.updateEnvironment({ uid: existing.uid, environment });
	}

	/** The workspace id: `workspaceId`, else the workspace named `workspace`, which is made when absent. Memoized. */
	private resolveWorkspaceId(): Promise<string> {
		const { workspaceId, workspace, workspaceType } = this.opts;
		if (workspaceId) return Promise.resolve(workspaceId);
		return (this.workspaceIdPromise ??= (async () => {
			const name = workspace as string;
			const found = (await this.listWorkspaces()).find((w) => w.name === name);
			if (found) return found.id;
			const { workspace: made } = await this.client().workspaces.create({
				name,
				type: workspaceType ?? "personal",
			});
			return made.id;
		})());
	}

	/** Checks the key and the configured workspace; reports the authenticated user and the workspace, or why either failed. */
	async doctor(): Promise<ToolingDoctorReport> {
		try {
			const me = await this.getMyself();
			const workspaces = await this.listWorkspaces();
			const wanted = this.opts.workspaceId ?? this.opts.workspace;
			const found = workspaces.find((w) => (this.opts.workspaceId ? w.id === wanted : w.name === wanted));
			if (!found && !this.opts.workspaceId) {
				return {
					ok: true,
					message: `authed as ${me.username}; workspace ${wanted} does not exist yet, \`sync\` makes it`,
				};
			}
			if (!found) {
				return {
					ok: false,
					message: `authed as ${me.username}, but workspace ${wanted} not visible`,
				};
			}
			return {
				ok: true,
				message: `authed as ${me.username}; workspace ${found.name} (${found.type}) accessible`,
			};
		} catch (err) {
			return {
				ok: false,
				message: errorMessage(err),
			};
		}
	}

	// ── Postman-specific methods ───────────────────────────────────────

	/** Returns the authenticated Postman user. */
	async getMyself(): Promise<PostmanUser> {
		const res = await this.client().me.get();
		return res.user ?? {};
	}

	/** Lists the workspaces the key can see. */
	async listWorkspaces(): Promise<PostmanWorkspace[]> {
		const { workspaces } = await this.client().workspaces.list();
		return workspaces;
	}

	/** Finds a collection in the workspace by exact name, or `null` when there is none. */
	async findCollectionByName(input: { workspaceId: string; name: string }): Promise<PostmanCollection | null> {
		const { collections } = await this.client().collections.list(input.workspaceId);
		return collections.find((c) => c.name === input.name) ?? null;
	}

	/** Creates a collection in the workspace from a Postman collection document. */
	async createCollection(input: { workspaceId: string; collection: unknown }): Promise<PostmanCollection> {
		const { collection } = await this.client().collections.create(input.workspaceId, input.collection);
		return collection;
	}

	/** Replaces the collection with this uid. */
	async updateCollection(input: { uid: string; collection: unknown }): Promise<PostmanCollection> {
		const { collection } = await this.client().collections.update(input.uid, input.collection);
		return collection;
	}

	/** Deletes the collection with this uid. */
	async deleteCollection(uid: string): Promise<void> {
		await this.client().collections.delete(uid);
	}

	/** Imports an OpenAPI document into the workspace as a collection; throws when Postman returns none. */
	async importOpenApi(input: { workspaceId: string; spec: unknown }): Promise<PostmanCollection> {
		const { collections } = await this.client().import.openapi(input.workspaceId, input.spec);
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

	/** Lists the workspace's environments. */
	async listEnvironments(input: { workspaceId: string }): Promise<PostmanEnvironment[]> {
		const { environments } = await this.client().environments.list(input.workspaceId);
		return environments;
	}

	/** Finds an environment in the workspace by exact name, or `null` when there is none. */
	async findEnvironmentByName(input: { workspaceId: string; name: string }): Promise<PostmanEnvironment | null> {
		const envs = await this.listEnvironments(input);
		return envs.find((e) => e.name === input.name) ?? null;
	}

	/** Reads one environment with its variables. */
	async getEnvironment(uid: string): Promise<PostmanEnvironment> {
		const { environment } = await this.client().environments.get(uid);
		return environment;
	}

	/** Creates an environment in the workspace. */
	async createEnvironment(input: { workspaceId: string; environment: unknown }): Promise<PostmanEnvironment> {
		const { environment } = await this.client().environments.create(input.workspaceId, input.environment);
		return environment;
	}

	/** Replaces the environment with this uid. */
	async updateEnvironment(input: { uid: string; environment: unknown }): Promise<PostmanEnvironment> {
		const { environment } = await this.client().environments.update(input.uid, input.environment);
		return environment;
	}

	/** Finds an API spec in the workspace by exact name, or `null` when there is none. */
	async findSpecByName(input: { workspaceId: string; name: string }): Promise<PostmanSpec | null> {
		const { specs } = await this.client().specs.list(input.workspaceId);
		return specs.find((s) => s.name === input.name) ?? null;
	}

	/** Creates an API spec in the workspace from the given file content. */
	async createSpec(input: {
		workspaceId: string;
		name: string;
		type?: string;
		filePath?: string;
		fileContent: string;
	}): Promise<PostmanSpec> {
		return this.client().specs.create(input.workspaceId, {
			name: input.name,
			type: input.type,
			filePath: input.filePath,
			fileContent: input.fileContent,
		});
	}

	/** Writes new content to a file of an existing spec. */
	async upsertSpecFile(input: { specId: string; filePath: string; content: string }): Promise<void> {
		await this.client().specs.updateFile(input.specId, input.filePath, input.content);
	}
}

/**
 * The file's variables, where a secret the file leaves empty takes the value the environment holds under the same
 * key, so syncing never blanks a secret someone set in Postman.
 */
export function keepSecrets(
	local: PostmanEnvironmentValue[],
	existing: PostmanEnvironmentValue[]
): PostmanEnvironmentValue[] {
	return local.map((v) => {
		if (v.type !== "secret" || v.value) return v;
		const held = existing.find((e) => e.key === v.key);
		return held?.value ? { ...v, value: held.value } : v;
	});
}
