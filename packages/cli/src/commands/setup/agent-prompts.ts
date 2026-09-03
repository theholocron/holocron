import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

	const gitignorePath = join(repoRoot, ".gitignore");
	const existing = await readFile(gitignorePath, "utf8").catch(() => "");
	const block = [PROMPTS_GITIGNORE_START, `/${AGENTS_PROMPTS_ROOT}/`, PROMPTS_GITIGNORE_END].join("\n");
	let updated: string;
	if (existing.includes(PROMPTS_GITIGNORE_START)) {
		const start = existing.indexOf(PROMPTS_GITIGNORE_START);
		const end = existing.indexOf(PROMPTS_GITIGNORE_END, start);
		const afterBlock = end !== -1 ? existing.slice(end + PROMPTS_GITIGNORE_END.length) : "\n";
		updated = existing.slice(0, start) + block + afterBlock;
	} else {
		updated = (existing.trimEnd() ? existing.trimEnd() + "\n\n" : "") + block + "\n";
	}
	await writeFile(gitignorePath, updated, "utf8");

	return `wrote ${Object.keys(AGENT_PROMPTS).length} prompt files to ${AGENTS_PROMPTS_ROOT}/`;
}
