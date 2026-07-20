import { readFileSync } from "node:fs";

import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/** Vite plugin: import *.yml files as default-exported strings. */
function rawYml(): Plugin {
	return {
		name: "raw-yml",
		transform(_code, id) {
			if (!id.endsWith(".yml")) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}

const base = library();

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), rawYml()],
	test: {
		...base.test,
		coverage: {
			...base.test?.coverage,
			exclude: [
				...(base.test?.coverage?.exclude ?? []),
				// CLI entry point — not unit-testable (yargs wiring, process.exit, etc.).
				// See issue #117.
				"src/cli.ts",
				// Pure TypeScript type definitions; no executable logic to cover.
				// See issue #117.
				"src/capabilities/index.ts",
				// Pure re-export shim — all logic lives in @theholocron/http-client.
				"src/rest-client.ts",
				// yml template files — string content only, no executable logic.
				"src/commands/dependabot.yml",
				"src/commands/workflows/**",
				"src/templates/actions/**",
				"src/templates/workflows/**",
			],
		},
	},
});
