import { generateConfigFiles } from "./generate-config-files.js";
import { generateTurboFiles } from "./generate-turbo-files.js";
import { generateWorkflowFiles } from "./generate-workflow-files.js";
import type { RepoFileEntry, RepoFilesInput } from "./repo-files.type.js";

/**
 * Every file `holocron repo setup` writes to disk from the config alone, in the order it writes them: the thin-caller
 * workflows, the config files, then `turbo.json` and its follow-up edits. No provider and no network, so a job without
 * a token can produce them, and `repo sync` takes the files it shares from here too. What setup reads from a provider
 * (CODEOWNERS, which needs the org, the installed skills, the agent prompts) is not here.
 */
export async function generateRepoFiles(input: RepoFilesInput): Promise<RepoFileEntry[]> {
	return [
		...generateWorkflowFiles(input),
		...(await generateConfigFiles(input)),
		...(await generateTurboFiles(input)),
	];
}
