import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DECISIONS_README, DECISIONS_TEMPLATE, SPECIFICATIONS_README, STANDARDS_README } from "./agent-prompts-data.js";

async function writeIfAbsent(filePath: string, content: string): Promise<boolean> {
	try {
		await access(filePath);
		return false; // already exists — skip
	} catch {
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, content, "utf8");
		return true;
	}
}

export async function installEngineeringStructure({ repoRoot }: { repoRoot: string }): Promise<string> {
	const results: string[] = [];

	const writes: Array<[string, string]> = [
		[join(repoRoot, "docs/wiki/decisions/template.md"), DECISIONS_TEMPLATE],
		[join(repoRoot, "docs/wiki/decisions/README.md"), DECISIONS_README],
		[join(repoRoot, "docs/wiki/standards/README.md"), STANDARDS_README],
		[join(repoRoot, "docs/wiki/specifications/README.md"), SPECIFICATIONS_README],
	];

	for (const [path, content] of writes) {
		const wrote = await writeIfAbsent(path, content);
		if (wrote) results.push(path.replace(repoRoot + "/", ""));
	}

	return results.length > 0 ? `created: ${results.join(", ")}` : "all files already exist — nothing to write";
}
