import type { Loaded } from "../load-config-file/index.js";
import type { ReadConfigSourceOptions } from "../read-config-source/index.js";

/** Options for {@link loadLayeredFromContent}: `loadLayered` for config files read through a `fetch` callback. */
export interface LoadLayeredFromContentOptions<T = unknown> extends ReadConfigSourceOptions {
	/**
	 * Directory the fetched files are written into before they are executed (see `loadConfigFromContent`): it has to sit
	 * under a tree where the packages a config imports resolve, which is what `withConfigSandbox` prepares. The caller
	 * creates and removes it.
	 */
	dir: string;
	/**
	 * Read `<file>.config.*` and take its `[key]` as the lower layer; the dedicated file (`name`), if any, is merged on
	 * top. Either layer may be absent.
	 */
	fallback?: {
		/** Base name of the fallback file, fetched as `<file>.config.*`. Not needed with `preloaded`. */
		file?: string;
		/** The key in the fallback file whose value is taken. */
		key: string;
		/**
		 * The fallback file as the caller already loaded it (`null`: it was looked for and isn't there), used as is instead
		 * of fetching it again. Its `filepath` is reported in `sources`.
		 */
		preloaded?: Loaded<object> | null;
	};
	/**
	 * Turns each layer's raw value into the shape being merged, before the merge; return `undefined` to treat the layer as
	 * absent. Same as `LoadLayeredOptions.coerce`.
	 */
	coerce?: (raw: unknown) => T | undefined;
}
