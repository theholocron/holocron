import { createHeader } from "../../../utils/create-header.js";
import commitMsgBody from "./commit-msg";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/commit-msg/create-config.ts",
});

export function createConfig(): string {
	return `${workflowHeader("shebang")}${commitMsgBody}`;
}
