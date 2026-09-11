import { createHeader } from "../../../utils/create-header.js";
import yamllintBody from "./yamllint.config.yml";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/yamllint/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${yamllintBody}`;
}
