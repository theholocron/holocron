import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfig } from "../config.js";
import { installSkills } from "../commands/setup.js";
import { runSkillsInstall } from "../commands/skills.js";
import type { LoadedConfig } from "../load-config.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
}

/** Create a fake @theholocron/skills package in node_modules under repoRoot. */
async function fakeSkillsPackage(
	repoRoot: string,
	skills: Record<string, Record<string, string | Record<string, string>>>
): Promise<void> {
	const pkgDir = join(repoRoot, "node_modules", "@theholocron", "skills");
	await mkdir(pkgDir, { recursive: true });
	// package.json with required exports map
	await writeFile(
		join(pkgDir, "package.json"),
		JSON.stringify({ name: "@theholocron/skills", exports: { "./package.json": "./package.json" } })
	);
	for (const [name, files] of Object.entries(skills)) {
		await writeSkillFiles(join(pkgDir, "skills", name), files);
	}
}

async function writeSkillFiles(dir: string, files: Record<string, string | Record<string, string>>): Promise<void> {
	await mkdir(dir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		if (typeof content === "string") {
			await writeFile(join(dir, name), content);
		} else {
			// nested directory
			await writeSkillFiles(join(dir, name), content);
		}
	}
}

describe("installSkills", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-skills-test-"));
		// Write a minimal package.json so createRequire resolves from this dir
		await writeFile(join(tmpDir, "package.json"), JSON.stringify({ name: "test-repo" }));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns informational message for unknown agent (step stays ok)", async () => {
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# git-safety" } });
		const result = await installSkills({ agent: "unknown-agent", skills: ["git-safety"], repoRoot: tmpDir });
		expect(result).toContain("no known skill install path");
		// No files should have been touched
		await expect(stat(join(tmpDir, ".agents"))).rejects.toThrow();
	});

	it("throws when @theholocron/skills is not installed (step becomes fail)", async () => {
		// No node_modules in tmpDir
		await expect(
			installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir })
		).rejects.toThrow("@theholocron/skills not found");
	});

	it("reports unknown skills and continues with known ones", async () => {
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# git-safety" } });
		const result = await installSkills({
			agent: "claude",
			skills: ["git-safety", "does-not-exist"],
			repoRoot: tmpDir,
		});
		expect(result).toMatch(/installed 1/);
		expect(result).toMatch(/unknown: does-not-exist/);
		// git-safety should have been installed
		const skillMd = await readFile(join(tmpDir, ".agents", "skills", "git-safety", "SKILL.md"), "utf8");
		expect(skillMd).toBe("# git-safety");
	});

	it("copies skill to .agents/skills/<name>/ and creates symlink at .claude/skills/<name>", async () => {
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# git-safety skill" } });
		const result = await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		expect(result).toMatch(/installed 1/);

		// Canonical copy in .agents/
		const agentsFile = await readFile(join(tmpDir, ".agents", "skills", "git-safety", "SKILL.md"), "utf8");
		expect(agentsFile).toBe("# git-safety skill");

		// Symlink at .claude/skills/git-safety
		const symlinkTarget = join(tmpDir, ".claude", "skills", "git-safety");
		const linked = await stat(symlinkTarget);
		expect(linked.isDirectory()).toBe(true); // resolves to the agents dir
	});

	it("handles nested directories inside a skill (recursive copy)", async () => {
		await fakeSkillsPackage(tmpDir, {
			"vercel-cli": {
				"SKILL.md": "# vercel-cli",
				references: { "deployment.md": "deploy docs" },
			},
		});
		await installSkills({ agent: "claude", skills: ["vercel-cli"], repoRoot: tmpDir });
		const nested = await readFile(
			join(tmpDir, ".agents", "skills", "vercel-cli", "references", "deployment.md"),
			"utf8"
		);
		expect(nested).toBe("deploy docs");
	});

	it("writes managed gitignore block with .agents/ and symlink paths", async () => {
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
		await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).toContain("# managed by holocron setup — skills");
		expect(gitignore).toContain("/.agents/skills/");
		expect(gitignore).toContain("/.claude/skills/git-safety");
		expect(gitignore).toContain("# end managed by holocron setup — skills");
	});

	it("uses forward slashes in gitignore entries regardless of OS", async () => {
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
		await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).not.toMatch(/\\/);
	});

	it("replaces existing managed block on re-run (no duplicate entries)", async () => {
		await fakeSkillsPackage(tmpDir, {
			"git-safety": { "SKILL.md": "# gs" },
			"pr-workflow": { "SKILL.md": "# pr" },
		});
		await installSkills({ agent: "claude", skills: ["git-safety", "pr-workflow"], repoRoot: tmpDir });
		await installSkills({ agent: "claude", skills: ["git-safety", "pr-workflow"], repoRoot: tmpDir });
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		const blockCount = (gitignore.match(/# managed by holocron setup — skills/g) ?? []).length;
		expect(blockCount).toBe(1);
	});

	it("preserves content outside the managed block when replacing", async () => {
		const before = "node_modules/\n\n";
		const after = "\n# other stuff\n";
		await writeFile(
			join(tmpDir, ".gitignore"),
			before +
				"# managed by holocron setup — skills\n" +
				"/.agents/skills/\n" +
				"/.claude/skills/git-safety\n" +
				"# end managed by holocron setup — skills" +
				after
		);
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
		await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).toContain("node_modules/");
		expect(gitignore).toContain("# other stuff");
	});

	it("produces a clean block with no duplicate entries when end marker is manually deleted", async () => {
		const existing =
			"node_modules/\n\n" +
			"# managed by holocron setup — skills\n" +
			"/.agents/skills/\n" +
			"/.claude/skills/git-safety\n";
		await writeFile(join(tmpDir, ".gitignore"), existing);
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
		await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		// Block must exist and end marker must be on its own line (not concatenated with entries)
		expect(gitignore).toContain("# managed by holocron setup — skills");
		const endMarkerLine = gitignore.split("\n").find((l) => l.startsWith("# end managed by holocron setup"));
		expect(endMarkerLine).toBe("# end managed by holocron setup — skills");
		// No duplicate /.agents/skills/ entries
		const agentsDirCount = (gitignore.match(/\/\.agents\/skills\//g) ?? []).length;
		expect(agentsDirCount).toBe(1);
	});

	it("prunes stale skill dirs and symlinks on re-run with a shorter list", async () => {
		await fakeSkillsPackage(tmpDir, {
			"git-safety": { "SKILL.md": "# gs" },
			"pr-workflow": { "SKILL.md": "# pr" },
		});
		// First install: both skills
		await installSkills({ agent: "claude", skills: ["git-safety", "pr-workflow"], repoRoot: tmpDir });
		// Second install: only git-safety
		const result = await installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir });
		expect(result).toContain("pruned: pr-workflow");

		// pr-workflow dirs should be removed
		await expect(stat(join(tmpDir, ".agents", "skills", "pr-workflow"))).rejects.toThrow();
		await expect(stat(join(tmpDir, ".claude", "skills", "pr-workflow"))).rejects.toThrow();

		// git-safety should still be present
		const skillFile = await readFile(join(tmpDir, ".agents", "skills", "git-safety", "SKILL.md"), "utf8");
		expect(skillFile).toBe("# gs");

		// gitignore block should not include pruned skill
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).not.toContain("pr-workflow");
		expect(gitignore).toContain("git-safety");
	});
});

describe("runSkillsInstall", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-skills-install-test-"));
		await writeFile(join(tmpDir, "package.json"), JSON.stringify({ name: "test-repo" }));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("prints nothing-to-install when agent or skills is absent", async () => {
		const lines: string[] = [];
		const loaded = loadedFrom({ name: "test", providers: {} });
		await runSkillsInstall({ loaded, context: { repoRoot: tmpDir }, print: (l) => lines.push(l) });
		expect(lines.join("\n")).toContain("Nothing to install");
	});

	it("respects --dry-run: prints would-install message without touching fs", async () => {
		await mkdir(join(tmpDir, "node_modules", "@theholocron", "skills"), { recursive: true });
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "package.json"),
			JSON.stringify({ name: "@theholocron/skills", exports: { "./package.json": "./package.json" } })
		);
		await mkdir(join(tmpDir, "node_modules", "@theholocron", "skills", "skills", "git-safety"), {
			recursive: true,
		});
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "skills", "git-safety", "SKILL.md"),
			"# gs"
		);

		const lines: string[] = [];
		const loaded = loadedFrom({ name: "test", providers: {}, agent: "claude", skills: ["git-safety"] });
		await runSkillsInstall({
			loaded,
			context: { repoRoot: tmpDir, dryRun: true },
			print: (l) => lines.push(l),
		});

		expect(lines.join("\n")).toContain("Would install");
		expect(lines.join("\n")).toContain("git-safety");
		// No files should have been written
		await expect(stat(join(tmpDir, ".agents"))).rejects.toThrow();
	});

	it("installs skills when agent and skills are configured", async () => {
		await mkdir(join(tmpDir, "node_modules", "@theholocron", "skills", "skills", "git-safety"), {
			recursive: true,
		});
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "package.json"),
			JSON.stringify({ name: "@theholocron/skills", exports: { "./package.json": "./package.json" } })
		);
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "skills", "git-safety", "SKILL.md"),
			"# git-safety"
		);

		const lines: string[] = [];
		const loaded = loadedFrom({ name: "test", providers: {}, agent: "claude", skills: ["git-safety"] });
		await runSkillsInstall({ loaded, context: { repoRoot: tmpDir }, print: (l) => lines.push(l) });
		expect(lines.join("\n")).toContain("Installing 1");
		expect(lines.join("\n")).toContain("installed 1");
	});
});
