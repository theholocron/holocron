import { workflowHeader } from "../../../setup-workflows.js";
import prepareCommitMsgBody from "./prepare-commit-msg";

export function createConfig(): string {
	return (
		workflowHeader(
			"packages/cli/src/commands/setup/templates/prepare-commit-msg/create-config.ts",
			false,
			"holocron setup",
			"shebang"
		) + prepareCommitMsgBody
	);
}
