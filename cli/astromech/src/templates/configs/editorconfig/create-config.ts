import { createHeader } from "../../../utils/index.js";
import editorconfigBody from "./editorconfig";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/editorconfig/create-config.ts",
});

/** The `.editorconfig` body, under the auto-generated header. */
export function createConfig(): string {
	return `${workflowHeader()}${editorconfigBody}`;
}
