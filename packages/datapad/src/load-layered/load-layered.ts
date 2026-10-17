import { loadConfigFile } from "../load-config-file/index.js";
import { mergeLayers } from "../merge-layers/index.js";
import type { LayeredResult, LoadLayeredOptions } from "./load-layered.type.js";

/**
 * `<name>.config.*` layered over the `[fallback.key]` of
 * `<fallback.file>.config.*`. Either, both, or neither may be present;
 * the dedicated file wins on conflict (vitest-over-vite). Returns `null`
 * when neither source resolves.
 */
export async function loadLayered<T>(opts: LoadLayeredOptions<T>): Promise<LayeredResult<T> | null> {
	const coerce = opts.coerce ?? ((raw: unknown) => raw as T | undefined);

	const dedicated = await loadConfigFile<unknown>(opts);
	let top: T | undefined;
	let topFile: string | null = null;
	if (dedicated) {
		top = coerce(dedicated.config);
		if (top !== undefined) topFile = dedicated.filepath;
	}

	let base: T | undefined;
	let baseFile: string | null = null;
	if (opts.fallback) {
		const parent =
			opts.fallback.preloaded !== undefined
				? opts.fallback.preloaded
				: await loadConfigFile<Record<string, unknown>>({
						cwd: opts.cwd,
						name: opts.fallback.file,
						extensions: opts.extensions,
						walkUp: opts.walkUp,
					});
		const raw = (parent?.config as Record<string, unknown> | undefined)?.[opts.fallback.key];
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
