import { createHeader } from "../../../../create-header/index.js";
import alexrc from "./alexrc.json";
import alexignore from "./alexignore";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/commands/setup/templates/alexjs/create-config.ts",
});

export function createRcConfig(): string {
	return JSON.stringify(alexrc, null, 2) + "\n";
}

export function createIgnoreConfig(): string {
	return `${workflowHeader()}${alexignore}`;
}
