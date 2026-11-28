import { createHeader } from "../../../utils/index.js";
import yamlignoreBody from "./.yamlignore";
import yamllintBody from "./.yamllint.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/yamllint/create-config.ts",
});

/** The `.yamllint.yml` body, under the auto-generated header. */
export function createConfig(): string {
	return `${workflowHeader()}${yamllintBody}`;
}

/** The `.yamlignore` body. */
export function createIgnoreConfig(): string {
	return `${workflowHeader()}${yamlignoreBody}`;
}
