import { createHeader } from "../../../utils/index.js";
import labelerBody from "./labeler.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/labeler/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${labelerBody}`;
}
