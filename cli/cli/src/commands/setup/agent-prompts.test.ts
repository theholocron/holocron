import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installAgentPrompts } from "./agent-prompts.js";
import { AGENT_PROMPTS } from "./agent-prompts-data.js";

describe("installAgentPrompts", () => {
	let tmpDir: string;
	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-prompts-test-"));
	});
	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("writes all prompt files to .agents/prompts/", async () => {
		await installAgentPrompts({ repoRoot: tmpDir });

		for (const filename of Object.keys(AGENT_PROMPTS)) {
			const content = await readFile(join(tmpDir, ".agents/prompts", filename), "utf8");
			expect(content).toBe(AGENT_PROMPTS[filename]);
		}
	});

	it("adds .agents/prompts/ to .gitignore with managed block", async () => {
		await installAgentPrompts({ repoRoot: tmpDir });

		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).toContain("# managed by holocron setup — prompts");
		expect(gitignore).toContain("/.agents/prompts/");
		expect(gitignore).toContain("# end managed by holocron setup — prompts");
	});

	it("replaces existing managed block without duplicating it", async () => {
		await installAgentPrompts({ repoRoot: tmpDir });
		await installAgentPrompts({ repoRoot: tmpDir });

		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		const count = (gitignore.match(/^# managed by holocron setup — prompts$/gm) ?? []).length;
		expect(count).toBe(1);
	});

	it("recovers gracefully when end marker is missing (orphaned start)", async () => {
		await writeFile(join(tmpDir, ".gitignore"), "# managed by holocron setup — prompts\n/.agents/prompts/\n");

		await installAgentPrompts({ repoRoot: tmpDir });

		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).toContain("# end managed by holocron setup — prompts");
		const count = (gitignore.match(/^# managed by holocron setup — prompts$/gm) ?? []).length;
		expect(count).toBe(1);
	});

	it("returns summary message", async () => {
		const result = await installAgentPrompts({ repoRoot: tmpDir });
		expect(result).toContain("wrote");
		expect(result).toContain(".agents/prompts/");
	});
});
