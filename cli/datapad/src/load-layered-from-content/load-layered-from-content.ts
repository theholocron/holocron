import { ConfigFileError } from "../errors/index.js";
import { loadConfigFromContent } from "../load-config-from-content/index.js";
import type { LayeredResult } from "../load-layered/index.js";
import { mergeLayers } from "../merge-layers/index.js";
import type { ConfigSource } from "../read-config-source/index.js";
import { readConfigSource } from "../read-config-source/index.js";
import type { LoadLayeredFromContentOptions } from "./load-layered-from-content.type.js";

/** Executes one fetched source, naming the file (as it was fetched) on a failure. */
async function execute(source: ConfigSource, name: string, dir: string): Promise<unknown> {
	try {
		return (
			await loadConfigFromContent<unknown>({ dir, content: source.content, name, extension: source.extension })
		).config;
	} catch (err) {
		throw new ConfigFileError(err instanceof Error ? err.message : String(err), source.path);
	}
}

/**
 * {@link loadLayered} for config files that live somewhere other than the local disk (a GitHub API, a git blob): the
 * dedicated `<name>.config.*` layered over the `[fallback.key]` of `<fallback.file>.config.*`, each probed through
 * `options.fetch` and executed in `options.dir`, then merged with {@link mergeLayers} (the dedicated file wins). Returns
 * `null` when neither layer resolves; `filepath` and `sources` are the paths as `fetch` was asked for them
 * (`astromech.config.ts`), lowest priority first.
 *
 * A source that is found but cannot be executed throws a {@link ConfigFileError} whose `filepath` is that path, so a
 * caller can say which file failed. Whatever `fetch` throws (a network failure, a permission error) propagates as it is.
 */
export async function loadLayeredFromContent<T>(
	options: LoadLayeredFromContentOptions<T>
): Promise<LayeredResult<T> | null> {
	const { dir, fetch, extensions, fallback } = options;
	const coerce = options.coerce ?? ((raw: unknown) => raw as T | undefined);

	const dedicated = await readConfigSource({ name: options.name, fetch, extensions });
	let top: T | undefined;
	let topFile: string | null = null;
	if (dedicated) {
		top = coerce(await execute(dedicated, options.name, dir));
		if (top !== undefined) topFile = dedicated.path;
	}

	let base: T | undefined;
	let baseFile: string | null = null;
	if (fallback) {
		let parent: { config: object; filepath: string } | null | undefined = fallback.preloaded;
		if (parent === undefined && fallback.file !== undefined) {
			const source = await readConfigSource({ name: fallback.file, fetch, extensions });
			parent = source
				? { config: (await execute(source, fallback.file, dir)) as object, filepath: source.path }
				: null;
		}
		const raw = (parent?.config as Record<string, unknown> | undefined)?.[fallback.key];
		if (parent && raw !== undefined) {
			base = coerce(raw);
			if (base !== undefined) baseFile = parent.filepath;
		}
	}

	const config = mergeLayers([base, top]);
	if (config === undefined) return null;

	const sources = [baseFile, topFile].filter((s): s is string => s !== null);
	return { config, filepath: topFile ?? baseFile, sources };
}
