import { readFileSync } from "node:fs";

export interface TransformTemplateOptions {
	/**
	 * Additional directory path segments. Any file whose resolved id contains
	 * one of these strings is transformed into a default-exported string,
	 * regardless of extension (except .json, which is handled natively by most
	 * bundlers and should not be double-transformed).
	 *
	 * @example
	 * transformTemplate({ dirs: ["/commands/setup/templates/"] })
	 */
	dirs?: string[];
}

/**
 * Rollup/Vite/Rolldown plugin that transforms text files into
 * default-exported string literals so they can be imported directly in code.
 *
 * Two categories of files are transformed:
 *  1. `.yml` and `.md` files — always, regardless of location (except under `node_modules`).
 *  2. Any non-JSON file whose resolved path contains a string listed in `dirs`.
 *
 * JSON files in `dirs` are intentionally excluded: bundlers handle `.json`
 * imports natively as typed objects, which is more useful than a raw string.
 *
 * @example
 * // vite.config.ts / vitest.config.ts / tsdown.config.ts
 * import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
 *
 * plugins: [transformTemplate({ dirs: ["/src/commands/setup/templates/"] })]
 */
export function transformTemplate(options: TransformTemplateOptions = {}) {
	const { dirs = [] } = options;
	return {
		name: "rollup-plugin-transform-template",
		transform(_code: string, id: string) {
			// Drop bundler query suffixes (`?raw`, `?v=123`) so the checks and the read see the real path.
			const file = id.split("?")[0];
			// Virtual modules and anything pulled in from a dependency are never templates;
			// reading them would let a dependency inline arbitrary local files.
			if (file.startsWith("\0") || file.includes("/node_modules/")) return null;
			const isYmlOrMd = file.endsWith(".yml") || file.endsWith(".md");
			// Exclude .json (native bundler handler) and TypeScript sources (they
			// live inside template directories alongside their template files).
			const isNativeOrSource = /\.(json|[cm]?tsx?)$/.test(file);
			const isTemplateDir = dirs.length > 0 && dirs.some((dir) => file.includes(dir)) && !isNativeOrSource;
			if (!isYmlOrMd && !isTemplateDir) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(file, "utf8"))};`,
				map: null,
			};
		},
	};
}
