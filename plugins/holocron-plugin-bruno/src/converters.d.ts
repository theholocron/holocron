/**
 * The converter and file-store packages ship no types of their own, so this declares the parts the plugin calls. A collection
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

	/**
	 * Writes Bruno's collection (its `name`, `root`, `items` and `environments`) as a v2.1 collection. It takes the
	 * collection it is given apart (it deletes the ids), so pass a collection that is not used again.
	 */
	export function brunoToPostman(
		collection: unknown,
		options?: { preserveScripts?: boolean }
	): Record<string, unknown>;

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

	/** Reads a collection's own file: its root settings and Bruno's config (the name is `brunoConfig.name`). */
	export function parseCollection(
		content: string,
		options?: { format?: "bru" | "yml" }
	): { collectionRoot: Record<string, unknown>; brunoConfig: { name?: string } & Record<string, unknown> };

	/** Reads a folder's own file; `meta` holds its name and position and the rest is the folder's settings. */
	export function parseFolder(
		content: string,
		options?: { format?: "bru" | "yml" }
	): { meta?: { name?: string; seq?: number }; docs?: unknown } & Record<string, unknown>;

	/** Reads one request's file into Bruno's item. */
	export function parseRequest(
		content: string,
		options?: { format?: "bru" | "yml" }
	): { name?: string; seq?: number } & Record<string, unknown>;

	/** Reads one environment's file. */
	export function parseEnvironment(
		content: string,
		options?: { format?: "bru" | "yml" }
	): {
		name: string;
		variables?: { name: string; value?: string; enabled?: boolean; secret?: boolean }[];
	};
}
