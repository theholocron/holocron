import { defineConfig } from "checkly";

const config = defineConfig({
	projectName: "holocron",
	logicalId: "holocron",
	checks: {
		checkMatch: "__checks__/**/*.check.ts",
	},
});

export default config;
