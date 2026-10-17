import { createHeader } from "../../../utils/index.js";
import dependabotBody from "./dependabot.yml";

const { workflowHeader } = createHeader({
	source: "packages/astromech/src/templates/configs/dependabot/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader()}${dependabotBody}`;
}
