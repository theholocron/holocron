import { readFileSync } from "node:fs";

const TEMPLATE_DIR = "/commands/setup/templates/";

/** Rollup/Vite plugin: transform raw text file imports into default-exported strings.
 *
 * Handles two cases:
 *  1. Any .yml or .md file (existing behaviour — workflow templates, dependabot config, etc.)
 *  2. Any file under commands/setup/templates/ regardless of extension (editorconfig, shell
 *     scripts, etc. that don't have a native TypeScript import handler).
 */
export function rawText() {
	return {
		name: "raw-text",
		transform(_code: string, id: string) {
			const isYmlOrMd = id.endsWith(".yml") || id.endsWith(".md");
			// .json files in the template dir are imported as native JS objects (via
			// Vite's built-in JSON handler) so callers can JSON.stringify them at the
			// write site — exclude them here to avoid double-transforming.
			const isSetupTemplate = id.includes(TEMPLATE_DIR) && !id.endsWith(".json");
			if (!isYmlOrMd && !isSetupTemplate) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}

/** @deprecated Use rawText() instead */
export const rawYml = rawText;
