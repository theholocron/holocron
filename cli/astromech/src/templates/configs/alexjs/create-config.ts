import { createHeader, formatJson } from "../../../utils/index.js";
import alexignore from "./alexignore";
import alexrc from "./alexrc.json";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/alexjs/create-config.ts",
});

/** The `.alexrc.json` body: the org's inclusive-language allow-list. */
export function createRcConfig(): string {
	return formatJson(alexrc);
}

/** The `.alexignore` body. */
export function createIgnoreConfig(): string {
	return `${workflowHeader()}${alexignore}`;
}
