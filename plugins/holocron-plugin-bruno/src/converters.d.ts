/**
 * The two converter packages ship no types of their own, so this declares the parts the plugin calls. A collection
 * and an environment are passed through untouched, which is why they are `unknown` here.
 */

declare module "@usebruno/converters" {
	/** The result of reading a v2.1 collection: Bruno's collection and what the script translation could not carry. */
	export interface PostmanToBrunoResult {
		collection: { name?: string; environments?: unknown[] } & Record<string, unknown>;
		issues?: unknown[];
	}

	/** Reads a v2.1 collection (an object) into Bruno's own collection, translating `pm.*` scripts to `bru.*` / `req.*`. */
	export function postmanToBruno(
		collection: unknown,
		options?: { useWorkers?: boolean; preserveScripts?: boolean }
	): Promise<PostmanToBrunoResult>;

	/** Reads an environment file into Bruno's environment. */
	export function postmanToBrunoEnvironment(
		environment: unknown
	): Promise<{ name: string; filename?: string; variables: unknown[] }>;
}

declare module "@usebruno/filestore" {
	/** A collection's own file (`opencollection.yml`): its root settings and Bruno's config, both passed through untouched. */
	export function stringifyCollection(
		collectionRoot: unknown,
		brunoConfig: { name?: string; type?: string; ignore?: string[] },
		options?: { format?: "bru" | "yml" }
	): string;

	/** A folder's own file (`folder.yml`); its name and position come from `meta`. */
	export function stringifyFolder(
		folderRoot: { meta?: { name?: string; seq?: number } } & Record<string, unknown>,
		options?: { format?: "bru" | "yml" }
	): string;

	/** One request's file. */
	export function stringifyRequest(item: unknown, options?: { format?: "bru" | "yml" }): string;

	/** One environment's file; a secret variable is written without its value. */
	export function stringifyEnvironment(environment: unknown, options?: { format?: "bru" | "yml" }): string;
}

declare module "@opencollection/converters" {
	/** Turns Bruno's collection (with its `environments`) into one OpenCollection document. */
	export function brunoToOpenCollection(collection: unknown): unknown;
}
