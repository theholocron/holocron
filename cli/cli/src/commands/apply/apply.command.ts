import type { Argv, CommandModule } from "yargs";

import { applyIssueTypesCommand } from "../apply-issue-types/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { repoPropertiesApplyCommand } from "../repo-properties/index.js";

export const applyCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "apply",
	describe: "Apply organization-level settings the repo's config depends on",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(repoPropertiesApplyCommand as never)
			.command(applyIssueTypesCommand as never)
			.command(groupMenu("apply") as never),
	handler: () => {},
};
