import type { LoadConfigFileOptions, Loaded } from "../load-config-file/index.js";

export interface LoadLayeredOptions<T = unknown> extends LoadConfigFileOptions {
	/**
	 * When no dedicated `<name>.config.*` exists — or in addition to it —
	 * read `<file>.config.*` and take its `[key]`. The dedicated file (if
	 * any) is merged on top.
	 */
	fallback?: {
		file: string;
		key: string;
		/**
		 * The `<file>.config.*` already loaded by the caller (`null`: it was
		 * looked for and isn't there). Used as is instead of loading it again;
		 * leave it `undefined` to have `loadLayered` find and load it.
		 */
		preloaded?: Loaded<object> | null;
	};
	/**
	 * Turns each layer's raw value — the dedicated file's default export, and
	 * the fallback's `[key]` — into the shape being merged, before the merge.
	 * Return `undefined` to treat the layer as absent. For configs that accept
	 * shorthand (a bare array standing for `{ tasks: [...] }`).
	 */
	coerce?: (raw: unknown) => T | undefined;
}

export interface LayeredResult<T> {
	config: T;
	/** The dedicated file path if present, else the fallback file path, else `null`. */
	filepath: string | null;
	/** Absolute paths actually merged, lowest priority first. */
	sources: string[];
}
