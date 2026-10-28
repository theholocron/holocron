import { createHeader } from "../../../utils/index.js";
import yamlignoreBody from "./.yamlignore";
import yamllintBody from "./.yamllint.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/yamllint/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${yamllintBody}`;
}

export function createIgnoreConfig(): string {
	return `${workflowHeader()}${yamlignoreBody}`;
}
