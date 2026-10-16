import { createHeader } from "../../../utils/create-header.js";
import labelerBody from "./labeler.yml";

const { workflowHeader } = createHeader({
	source: "packages/astromech/src/templates/configs/labeler/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${labelerBody}`;
}
