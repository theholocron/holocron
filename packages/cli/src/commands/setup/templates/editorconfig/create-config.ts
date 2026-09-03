import { createHeader } from "../../../create-header/index.js";
import editorconfigBody from "./editorconfig";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/commands/setup/templates/editorconfig/create-config.ts",
});

export function createConfig(): string {
	return workflowHeader() + editorconfigBody;
}
