import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

import { installSkills } from "../commands/setup.js";
import { runSkillsInstall, runSkillsRemove, runSkillsUpdate } from "../commands/skills.js";
import { resolveConfig } from "../config.js";
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
		await writeSkillFiles(join(pkgDir, "src", name), files);
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

	it("calls pnpm add when @theholocron/skills is missing and throws if install fails", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValueOnce({ status: 1 });

		await expect(installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir })).rejects.toThrow(
			"failed to auto-install @theholocron/skills"
		);
		expect(spy).toHaveBeenCalledWith(
			"pnpm",
			["add", "-D", "@theholocron/skills"],
			expect.objectContaining({ cwd: tmpDir })
		);
	});

	it("throws if pnpm add succeeds but package is still unresolvable", async () => {
		// spawnSync global mock returns { status: 0 } — install "succeeds" but nothing was written
		await expect(installSkills({ agent: "claude", skills: ["git-safety"], repoRoot: tmpDir })).rejects.toThrow(
			"failed to auto-install @theholocron/skills"
		);
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

	it("keeps gitignore entry for a skill that is configured but missing from upstream", async () => {
		// First run installs both skills normally
		await fakeSkillsPackage(tmpDir, {
			"git-safety": { "SKILL.md": "# gs" },
			"pr-workflow": { "SKILL.md": "# pr" },
		});
		await installSkills({ agent: "claude", skills: ["git-safety", "pr-workflow"], repoRoot: tmpDir });

		// Second run: pr-workflow disappears from upstream package
		await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
		await installSkills({ agent: "claude", skills: ["git-safety", "pr-workflow"], repoRoot: tmpDir });

		// pr-workflow artifacts still on disk from first run; gitignore must keep the entry
		const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf8");
		expect(gitignore).toContain("pr-workflow");
	});

	describe("external skills (via skills-lock.json)", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("fetches and installs an external skill found in skills-lock.json", async () => {
			await fakeSkillsPackage(tmpDir, {});
			await writeFile(
				join(tmpDir, "node_modules", "@theholocron", "skills", "skills-lock.json"),
				JSON.stringify({
					version: 1,
					skills: {
						turborepo: {
							source: "vercel/turbo",
							sourceType: "github",
							skillPath: "skills/turborepo/SKILL.md",
						},
					},
				})
			);
			vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => "# turborepo skill" }));

			const result = await installSkills({ agent: "claude", skills: ["turborepo"], repoRoot: tmpDir });

			expect(result).toContain("installed 1");
			expect(result).not.toContain("unknown");
			expect(result).not.toContain("fetch failed");
			const content = await readFile(join(tmpDir, ".agents", "skills", "turborepo", "SKILL.md"), "utf8");
			expect(content).toBe("# turborepo skill");
			await expect(stat(join(tmpDir, ".claude", "skills", "turborepo"))).resolves.toBeDefined();
		});

		it("reports fetch failed when the upstream request returns a non-ok status", async () => {
			await fakeSkillsPackage(tmpDir, {});
			await writeFile(
				join(tmpDir, "node_modules", "@theholocron", "skills", "skills-lock.json"),
				JSON.stringify({
					version: 1,
					skills: {
						turborepo: {
							source: "vercel/turbo",
							sourceType: "github",
							skillPath: "skills/turborepo/SKILL.md",
						},
					},
				})
			);
			vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }));

			const result = await installSkills({ agent: "claude", skills: ["turborepo"], repoRoot: tmpDir });

			expect(result).toContain("fetch failed: turborepo");
			expect(result).not.toContain("unknown");
		});

		it("installs and marks stale when the content hash does not match", async () => {
			await fakeSkillsPackage(tmpDir, {});
			await writeFile(
				join(tmpDir, "node_modules", "@theholocron", "skills", "skills-lock.json"),
				JSON.stringify({
					version: 1,
					skills: {
						turborepo: {
							source: "vercel/turbo",
							sourceType: "github",
							skillPath: "skills/turborepo/SKILL.md",
							computedHash: "0000000000000000000000000000000000000000000000000000000000000000",
						},
					},
				})
			);
			vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => "# turborepo skill" }));

			const result = await installSkills({ agent: "claude", skills: ["turborepo"], repoRoot: tmpDir });

			// Installed despite mismatch, but flagged stale so the user knows to refresh the lock
			expect(result).toContain("installed 1");
			expect(result).toContain("stale: turborepo");
			expect(result).not.toContain("fetch failed");
			const content = await readFile(join(tmpDir, ".agents", "skills", "turborepo", "SKILL.md"), "utf8");
			expect(content).toBe("# turborepo skill");
		});

		it("still reports unknown for skills absent from both skills/ dir and skills-lock.json", async () => {
			await fakeSkillsPackage(tmpDir, {});
			await writeFile(
				join(tmpDir, "node_modules", "@theholocron", "skills", "skills-lock.json"),
				JSON.stringify({ version: 1, skills: {} })
			);

			const result = await installSkills({ agent: "claude", skills: ["no-such-skill"], repoRoot: tmpDir });

			expect(result).toContain("unknown: no-such-skill");
		});

		it("installs owned skills and fetches external skills in one pass", async () => {
			await fakeSkillsPackage(tmpDir, { "git-safety": { "SKILL.md": "# gs" } });
			await writeFile(
				join(tmpDir, "node_modules", "@theholocron", "skills", "skills-lock.json"),
				JSON.stringify({
					version: 1,
					skills: {
						turborepo: {
							source: "vercel/turbo",
							sourceType: "github",
							skillPath: "skills/turborepo/SKILL.md",
						},
					},
				})
			);
			vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => "# turborepo" }));

			const result = await installSkills({
				agent: "claude",
				skills: ["git-safety", "turborepo"],
				repoRoot: tmpDir,
			});

			expect(result).toContain("installed 2");
			expect(result).not.toContain("unknown");
			await expect(readFile(join(tmpDir, ".agents", "skills", "git-safety", "SKILL.md"), "utf8")).resolves.toBe(
				"# gs"
			);
			await expect(readFile(join(tmpDir, ".agents", "skills", "turborepo", "SKILL.md"), "utf8")).resolves.toBe(
				"# turborepo"
			);
		});
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

	it("falls back to console.log when no print function is provided", async () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedFrom({ name: "test", providers: {} });
		await runSkillsInstall({ loaded, context: { repoRoot: tmpDir } });
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("Nothing to install"));
		spy.mockRestore();
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
		await mkdir(join(tmpDir, "node_modules", "@theholocron", "skills", "src", "git-safety"), {
			recursive: true,
		});
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "package.json"),
			JSON.stringify({ name: "@theholocron/skills", exports: { "./package.json": "./package.json" } })
		);
		await writeFile(
			join(tmpDir, "node_modules", "@theholocron", "skills", "src", "git-safety", "SKILL.md"),
			"# git-safety"
		);

		const lines: string[] = [];
		const loaded = loadedFrom({ name: "test", providers: {}, agent: "claude", skills: ["git-safety"] });
		await runSkillsInstall({ loaded, context: { repoRoot: tmpDir }, print: (l) => lines.push(l) });
		expect(lines.join("\n")).toContain("Installing 1");
		expect(lines.join("\n")).toContain("installed 1");
	});

	it("prints a graceful error message when @theholocron/skills cannot be installed", async () => {
		// spawnSync global mock returns { status: 0 } but package is still unresolvable
		const lines: string[] = [];
		const loaded = loadedFrom({ name: "test", providers: {}, agent: "claude", skills: ["git-safety"] });
		await runSkillsInstall({ loaded, context: { repoRoot: tmpDir }, print: (l) => lines.push(l) });
		const output = lines.join("\n");
		expect(output).toContain("Installing");
		expect(output).toContain("failed to auto-install @theholocron/skills");
		// Must not throw — error is caught and printed
	});
});

// ── defaultExec (skills) ─────────────────────────────────────────────────────

describe("defaultExec", () => {
	it("calls spawnSync with npx args when exec is not injected", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: 0 });

		const report = runSkillsUpdate({ context: { repoRoot: "/repo" } });

		expect(spy).toHaveBeenCalledWith("npx", ["skills", "update"], expect.objectContaining({ cwd: "/repo" }));
		expect(report.status).toBe("ok");
	});

	it("returns fail status when spawnSync exits non-zero", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: 1 });

		const report = runSkillsUpdate({ context: { repoRoot: "/repo" } });
		expect(report.status).toBe("fail");
	});

	it("handles null exit status (spawnSync status ?? -1)", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: null });

		const report = runSkillsUpdate({ context: { repoRoot: "/repo" } });
		expect(report.status).toBe("fail");
	});
});

// ── runSkillsRemove ───────────────────────────────────────────────────────────

describe("runSkillsRemove", () => {
	it("calls npx skills remove with no args when no names are given", () => {
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const exec = (cmd: string, args: string[], _opts: { cwd: string }) => {
			calls.push({ cmd, args });
			return { exitCode: 0 };
		};

		const report = runSkillsRemove({ context: { repoRoot: "/repo" }, exec });

		expect(report.status).toBe("ok");
		expect(calls[0]!.cmd).toBe("npx");
		expect(calls[0]!.args).toEqual(["skills", "remove"]);
	});

	it("appends skill names when names are given", () => {
		const calls: Array<{ args: string[] }> = [];
		const exec = (cmd: string, args: string[], _opts: { cwd: string }) => {
			calls.push({ args });
			return { exitCode: 0 };
		};

		runSkillsRemove({ context: { repoRoot: "/repo" }, names: ["git-safety", "pr-workflow"], exec });

		expect(calls[0]!.args).toEqual(["skills", "remove", "git-safety", "pr-workflow"]);
	});

	it("uses defaultExec (spawnSync) when exec is not injected", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: 0 });

		const report = runSkillsRemove({ context: { repoRoot: "/repo" } });
		expect(spy).toHaveBeenCalledWith("npx", ["skills", "remove"], expect.objectContaining({ cwd: "/repo" }));
		expect(report.status).toBe("ok");
	});

	it("returns fail when npx exits with a non-zero code", () => {
		const exec = () => ({ exitCode: 1 });
		const report = runSkillsRemove({ context: { repoRoot: "/repo" }, exec });
		expect(report.status).toBe("fail");
	});

	it("dry-run prints would-run message and does not exec", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		runSkillsRemove({ context: { repoRoot: "/repo", dryRun: true }, exec });
		expect(exec).not.toHaveBeenCalled();
	});
});

// ── runSkillsUpdate ───────────────────────────────────────────────────────────

describe("runSkillsUpdate", () => {
	it("calls npx skills update with no args when no name is given", () => {
		const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
		const exec = (cmd: string, args: string[], opts: { cwd: string }) => {
			calls.push({ cmd, args, cwd: opts.cwd });
			return { exitCode: 0 };
		};

		const report = runSkillsUpdate({ context: { repoRoot: "/repo" }, exec });

		expect(report.status).toBe("ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.cmd).toBe("npx");
		expect(calls[0]!.args).toEqual(["skills", "update"]);
		expect(calls[0]!.cwd).toBe("/repo");
	});

	it("appends the skill name when name is given", () => {
		const calls: Array<{ args: string[] }> = [];
		const exec = (cmd: string, args: string[], _opts: { cwd: string }) => {
			calls.push({ args });
			return { exitCode: 0 };
		};

		runSkillsUpdate({ context: { repoRoot: "/repo" }, name: "vercel-cli", exec });

		expect(calls[0]!.args).toEqual(["skills", "update", "vercel-cli"]);
	});

	it("returns fail when npx exits with a non-zero code", () => {
		const exec = () => ({ exitCode: 1 });
		const report = runSkillsUpdate({ context: { repoRoot: "/repo" }, exec });
		expect(report.status).toBe("fail");
	});

	it("dry-run prints would-run message and does not exec", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const report = runSkillsUpdate({
			context: { repoRoot: "/repo", dryRun: true },
			exec,
		});

		expect(report.status).toBe("dry-run");
		expect(exec).not.toHaveBeenCalled();
	});
});
