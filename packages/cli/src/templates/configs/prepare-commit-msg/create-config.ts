import { createHeader } from "../../../create-header/index.js";
import prepareCommitMsgBody from "./prepare-commit-msg";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/prepare-commit-msg/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader("shebang")}${prepareCommitMsgBody}`;
}
