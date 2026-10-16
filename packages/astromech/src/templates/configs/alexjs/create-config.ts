import { stringifyJson } from "@theholocron/json-utils";

import { createHeader } from "../../../utils/create-header.js";
import alexignore from "./alexignore";
import alexrc from "./alexrc.json";

const { workflowHeader } = createHeader({
	source: "packages/astromech/src/templates/configs/alexjs/create-config.ts",
});

export function createRcConfig(): string {
	return stringifyJson(alexrc);
}

export function createIgnoreConfig(): string {
	return `${workflowHeader()}${alexignore}`;
}
