import type { OrgIssueType } from "../../../config/index.js";
import type { PluginLoader } from "../../../plugin/index.js";

/** What {@link issueTypesStep} needs. */
export interface IssueTypesStepInput {
	/** The Types the org area declares (`config.issueTypes`). None or an empty list: no step at all. */
	declared: readonly OrgIssueType[] | undefined;
	/** The loaded plugins, for the `issues` provider. */
	loader: PluginLoader;
	dryRun: boolean;
	/** `--yes`: change the organization without asking. */
	yes?: boolean;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
}
