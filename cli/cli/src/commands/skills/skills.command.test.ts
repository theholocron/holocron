import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn(async () => ({ resolved: {}, filepath: "/x" })));
const runSkillsInstall = vi.hoisted(() => vi.fn(async () => {}));
const runSkillsList = vi.hoisted(() => vi.fn(() => ({ status: "ok", skills: [] })));
const runSkillsRemove = vi.hoisted(() => vi.fn(() => ({ status: "ok" })));
const runSkillsUpdate = vi.hoisted(() => vi.fn(() => ({ status: "ok" })));
const listInstalledSkills = vi.hoisted(() => vi.fn((): string[] => ["a", "b"]));
const checkbox = vi.hoisted(() => vi.fn(async () => ["a"]));
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("@inquirer/prompts", () => ({ checkbox }));
vi.mock("./skills.js", () => ({
	listInstalledSkills,
	runSkillsInstall,
	runSkillsList,
	runSkillsRemove,
	runSkillsUpdate,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import yargs from "yargs";

import { listCommand } from "../list/list.command.js";
import { removeCommand } from "../remove/remove.command.js";
import { skillsCommand } from "./skills.command.js";

const parse = (args: string[]) =>
	yargs(args)
		.option("cwd", { type: "string", default: "/repo" })
		.option("dry-run", { type: "boolean", default: false })
		.command(skillsCommand as never)
		.command(listCommand as never)
		.command(removeCommand as never)
		.fail((msg, err) => {
			throw err ?? new Error(msg);
		})
		.parseAsync();

const withTerminal = (isTTY: boolean) => {
	Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
};

beforeEach(() => {
	vi.clearAllMocks();
	withTerminal(false);
});
afterEach(() => void (process.exitCode = undefined));

describe("skills command", () => {
	it("installs from the config in --cwd, honouring --dry-run", async () => {
		await parse(["skills", "install", "--dry-run"]);
		expect(runSkillsInstall).toHaveBeenCalledWith({
			loaded: { resolved: {}, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true },
		});
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
			expect.objectContaining({ pickMessage: "skills — choose a subcommand:", startPath: ["skills"] })
		);
	});
});

describe("list skills", () => {
	it("lists the installed skills of --cwd", async () => {
		await parse(["list", "skills"]);
		expect(runSkillsList).toHaveBeenCalledWith({ context: { repoRoot: "/repo", dryRun: false } });
	});
});

describe("remove skill", () => {
	it("removes the named skills and exits 1 on failure", async () => {
		await parse(["remove", "skill", "a", "b"]);
		expect(runSkillsRemove).toHaveBeenCalledWith({
			context: { repoRoot: "/repo", dryRun: false },
			names: ["a", "b"],
		});
		runSkillsRemove.mockReturnValue({ status: "fail" });
		await parse(["remove", "skill", "a"]);
		expect(process.exitCode).toBe(1);
	});

	it("removes every installed skill with --all", async () => {
		await parse(["remove", "skill", "--all"]);
		expect(runSkillsRemove).toHaveBeenCalledWith({ context: { repoRoot: "/repo", dryRun: false } });
	});

	it("refuses names together with --all", async () => {
		await expect(parse(["remove", "skill", "a", "--all"])).rejects.toThrow(/not both/);
		expect(runSkillsRemove).not.toHaveBeenCalled();
	});

	it("refuses a bare call without a terminal instead of removing everything", async () => {
		const err = await parse(["remove", "skill"]).catch((e: unknown) => e);
		expect((err as Error).name).toBe("NonInteractiveError");
		expect((err as Error).message).toMatch(/--all/);
		expect(runSkillsRemove).not.toHaveBeenCalled();
	});

	it("asks which installed skills to remove on a terminal", async () => {
		withTerminal(true);
		await parse(["remove", "skill"]);
		expect(checkbox).toHaveBeenCalledWith(expect.objectContaining({ choices: ["a", "b"] }));
		expect(runSkillsRemove).toHaveBeenCalledWith({
			context: { repoRoot: "/repo", dryRun: false },
			names: ["a"],
		});
	});

	it("does nothing when nothing was picked", async () => {
		withTerminal(true);
		checkbox.mockResolvedValueOnce([]);
		await parse(["remove", "skill"]);
		expect(runSkillsRemove).not.toHaveBeenCalled();
	});

	it("says so when no skill is installed", async () => {
		withTerminal(true);
		listInstalledSkills.mockReturnValueOnce([]);
		await expect(parse(["remove", "skill"])).rejects.toThrow(/no skills are installed/);
		expect(checkbox).not.toHaveBeenCalled();
	});
});
