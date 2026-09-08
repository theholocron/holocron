import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

const base = library();

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), transformTemplate()],
	test: {
		...base.test,
		coverage: {
			...base.test?.coverage,
			exclude: [
				...(base.test?.coverage?.exclude ?? []),
				// Barrel re-exports — no executable logic; v8 tracks them at 0%.
				"src/index.ts",
				"src/config/index.ts",
				// Raw workflow YAML strings — no executable logic.
				"src/templates/**",
			],
		},
	},
});
