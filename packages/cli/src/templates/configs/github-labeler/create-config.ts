import { createHeader } from "../../../create-header/index.js";
import labelerBody from "./github-labeler.yml";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/github-labeler/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${labelerBody}`;
}
