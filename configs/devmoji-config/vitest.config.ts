import { coverage, node } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	...node(),
	test: {
		...node().test,
		coverage: {
			...coverage,
			include: ["index.ts"],
		},
	},
});
