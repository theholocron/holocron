import { workflowHeader } from "../../../setup-workflows.js";
import labelerBody from "./github-labeler.yml";

export function createConfig(): string {
	return workflowHeader("packages/cli/src/commands/setup/templates/github-labeler/create-config.ts") + labelerBody;
}
