import { workflowHeader } from "../../../setup-workflows.js";
import editorconfigBody from "./editorconfig";

export function createConfig(): string {
	return workflowHeader("packages/cli/src/commands/setup/templates/editorconfig/create-config.ts") + editorconfigBody;
}
