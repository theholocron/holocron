import { createHeader } from "../../../utils/create-header.js";
import editorconfigBody from "./editorconfig";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/editorconfig/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${editorconfigBody}`;
}
