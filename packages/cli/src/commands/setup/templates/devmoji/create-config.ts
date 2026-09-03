import { workflowHeader } from "../../../setup-workflows.js";

export function createConfig(): string {
	return [
		workflowHeader(
			"packages/cli/src/commands/setup/templates/devmoji/create-config.ts",
			false,
			"holocron setup",
			"cjs"
		),
		`/* eslint-disable */`,
		`const { defineConfig } = require("@theholocron/devmoji-config");`,
		`module.exports = defineConfig();`,
		``,
	].join("\n");
}
