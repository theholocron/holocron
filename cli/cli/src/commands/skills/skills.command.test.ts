import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn(async () => ({ resolved: {}, filepath: "/x" })));
const runSkillsInstall = vi.hoisted(() => vi.fn(async () => {}));
const runSkillsRemove = vi.hoisted(() => vi.fn(() => ({ status: "ok" })));
const runSkillsUpdate = vi.hoisted(() => vi.fn(() => ({ status: "ok" })));
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./skills.js", () => ({ runSkillsInstall, runSkillsRemove, runSkillsUpdate }));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import yargs from "yargs";

import { skillsCommand } from "./skills.command.js";

const parse = (args: string[]) =>
	yargs(args)
		.option("cwd", { type: "string", default: "/repo" })
		.option("dry-run", { type: "boolean", default: false })
		.command(skillsCommand as never)
		.parseAsync();

beforeEach(() => vi.clearAllMocks());
afterEach(() => void (process.exitCode = undefined));

describe("skills command", () => {
	it("installs from the config in --cwd, honouring --dry-run", async () => {
		await parse(["skills", "install", "--dry-run"]);
		expect(runSkillsInstall).toHaveBeenCalledWith({
			loaded: { resolved: {}, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true },
		});
	});

	it("removes the named skills, or all of them, and exits 1 on failure", async () => {
		await parse(["skills", "remove", "a", "b"]);
		expect(runSkillsRemove).toHaveBeenCalledWith({
			context: { repoRoot: "/repo", dryRun: false },
			names: ["a", "b"],
		});
		runSkillsRemove.mockClear();
		runSkillsRemove.mockReturnValue({ status: "fail" });
		await parse(["skills", "remove"]);
		expect(runSkillsRemove).toHaveBeenCalledWith({ context: { repoRoot: "/repo", dryRun: false } });
		expect(process.exitCode).toBe(1);
	});

	it("updates one skill, or all of them, and exits 1 on failure", async () => {
		await parse(["skills", "update", "a"]);
		expect(runSkillsUpdate).toHaveBeenCalledWith({ context: { repoRoot: "/repo", dryRun: false }, name: "a" });
		runSkillsUpdate.mockClear();
		runSkillsUpdate.mockReturnValue({ status: "fail" });
		await parse(["skills", "update"]);
		expect(runSkillsUpdate).toHaveBeenCalledWith({ context: { repoRoot: "/repo", dryRun: false } });
		expect(process.exitCode).toBe(1);
	});

	it("opens a menu of the subcommands for a bare `skills`", async () => {
		await parse(["skills"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ cwd: "/repo" }),
			"skills — choose a subcommand:",
			expect.any(String),
			["skills"]
		);
	});
});
