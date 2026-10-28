import { createHeader } from "../../../utils/index.js";
import prepareCommitMsgBody from "./prepare-commit-msg";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/prepare-commit-msg/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader("shebang")}${prepareCommitMsgBody}`;
}
