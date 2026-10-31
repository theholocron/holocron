import { createHeader } from "../../../utils/index.js";
import labelerBody from "./labeler.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/labeler/create-config.ts",
});

/** The `.github/labeler.yml` body, which labels a pull request by its Conventional Commit type. */
export function createConfig(): string {
	return `${workflowHeader()}${labelerBody}`;
}
