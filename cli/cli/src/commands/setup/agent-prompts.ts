import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { updateGitignore } from "@theholocron/git-utils";

import { AGENT_PROMPTS } from "./agent-prompts-data.js";

const AGENTS_PROMPTS_ROOT = ".agents/prompts";
const PROMPTS_GITIGNORE_START = "# managed by holocron setup — prompts";
const PROMPTS_GITIGNORE_END = "# end managed by holocron setup — prompts";

export async function installAgentPrompts({ repoRoot }: { repoRoot: string }): Promise<string> {
	const promptsDir = join(repoRoot, AGENTS_PROMPTS_ROOT);
	await mkdir(promptsDir, { recursive: true });

	for (const [filename, content] of Object.entries(AGENT_PROMPTS)) {
		await writeFile(join(promptsDir, filename), content, "utf8");
	}

	await updateGitignore(join(repoRoot, ".gitignore"), {
		start: PROMPTS_GITIGNORE_START,
		end: PROMPTS_GITIGNORE_END,
		lines: [`/${AGENTS_PROMPTS_ROOT}/`],
	});

	return `wrote ${Object.keys(AGENT_PROMPTS).length} prompt files to ${AGENTS_PROMPTS_ROOT}/`;
}
