import { readFileSync } from "node:fs";

export interface RawTextOptions {
	/**
	 * Additional directory path segments. Any file whose resolved id contains
	 * one of these strings is transformed into a default-exported string,
	 * regardless of extension (except .json, which is handled natively by most
	 * bundlers and should not be double-transformed).
	 *
	 * @example
	 * rawText({ dirs: ["/commands/setup/templates/"] })
	 */
	dirs?: string[];
}

/**
 * Rollup/Vite/Rolldown plugin that transforms text files into
 * default-exported string literals so they can be imported directly in code.
 *
 * Two categories of files are transformed:
 *  1. `.yml` and `.md` files — always, regardless of location.
 *  2. Any non-JSON file whose resolved path contains a string listed in `dirs`.
 *
 * JSON files in `dirs` are intentionally excluded: bundlers handle `.json`
 * imports natively as typed objects, which is more useful than a raw string.
 *
 * @example
 * // vite.config.ts / vitest.config.ts / tsdown.config.ts
 * import { rawText } from "@theholocron/rollup-transform-template";
 *
 * plugins: [rawText({ dirs: ["/src/commands/setup/templates/"] })]
 */
export function rawText(options: RawTextOptions = {}) {
	const { dirs = [] } = options;
	return {
		name: "rollup-transform-template",
		transform(_code: string, id: string) {
			const isYmlOrMd = id.endsWith(".yml") || id.endsWith(".md");
			// Exclude .json (native bundler handler) and .ts/.tsx (source files that
			// live inside template directories alongside their template files).
			const isNativeOrSource = id.endsWith(".json") || id.endsWith(".ts") || id.endsWith(".tsx");
			const isTemplateDir = dirs.length > 0 && dirs.some((dir) => id.includes(dir)) && !isNativeOrSource;
			if (!isYmlOrMd && !isTemplateDir) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}
