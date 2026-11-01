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
			// The workflow and action text, imported as strings: no executable logic.
			exclude: [...(base.test?.coverage?.exclude ?? []), "src/index.ts"],
		},
	},
});
