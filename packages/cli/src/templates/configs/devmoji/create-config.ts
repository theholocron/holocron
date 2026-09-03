import { createHeader } from "../../../utils/create-header.js";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/devmoji/create-config.ts",
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
