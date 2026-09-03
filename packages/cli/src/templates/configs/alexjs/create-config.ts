import { createHeader } from "../../../utils/create-header.js";
import alexignore from "./alexignore";
import alexrc from "./alexrc.json";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/alexjs/create-config.ts",
});

export function createRcConfig(): string {
	return JSON.stringify(alexrc, null, 2) + "\n";
}

export function createIgnoreConfig(): string {
	return `${workflowHeader()}${alexignore}`;
}
