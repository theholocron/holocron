import { createHeader } from "../../../utils/create-header.js";
import yamlignoreBody from "./.yamlignore";
import yamllintBody from "./.yamllint.yml";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/yamllint/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${yamllintBody}`;
}

export function createIgnoreConfig(): string {
	return `${workflowHeader()}${yamlignoreBody}`;
}
