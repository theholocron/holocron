import { createHeader } from "../../../utils/index.js";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/devmoji/create-config.ts",
});

export function createConfig(): string {
	return [
		workflowHeader("cjs"),
		`/* eslint-disable */`,
		`const { defineConfig } = require("@theholocron/devmoji-config");`,
		`module.exports = defineConfig();`,
		``,
	].join("\n");
}
