import { createHeader } from "../../../utils/index.js";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/devmoji/create-config.ts",
});

/** The `devmoji.config.cjs` body, which defers to `@theholocron/devmoji-config`. */
export function createConfig(): string {
	return [
		workflowHeader("cjs"),
		`/* eslint-disable */`,
		`const { defineConfig } = require("@theholocron/devmoji-config");`,
		`module.exports = defineConfig();`,
		``,
	].join("\n");
}
