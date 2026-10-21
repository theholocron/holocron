import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inputMock = vi.fn();
const selectMock = vi.fn();
const confirmMock = vi.fn();
const checkboxMock = vi.fn();
const passwordMock = vi.fn();
vi.mock("@inquirer/prompts", () => ({
	input: (...args: unknown[]) => inputMock(...args),
	select: (...args: unknown[]) => selectMock(...args),
	confirm: (...args: unknown[]) => confirmMock(...args),
	checkbox: (...args: unknown[]) => checkboxMock(...args),
	password: (...args: unknown[]) => passwordMock(...args),
}));

const { NonInteractiveError } = await import("../non-interactive-error/index.js");
const { promptForOptions } = await import("./prompt-options.js");
import type { OptionsCommand } from "./prompt-options.type.js";

function setTTY(value: boolean): void {
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

describe("promptForOptions — flat options", () => {
	beforeEach(() => {
		inputMock.mockReset();
		selectMock.mockReset();
		confirmMock.mockReset();
		checkboxMock.mockReset();
		passwordMock.mockReset();
		setTTY(true);
	});
	afterEach(() => setTTY(false));

	it("returns no options/answers and prompts nothing for a command with no declared options", async () => {
		const entry: OptionsCommand = { name: "doctor" };
		expect(await promptForOptions(entry, {})).toEqual({ options: [], answers: {} });
		expect(checkboxMock).not.toHaveBeenCalled();
	});

	it("always prompts a required option, never behind the checkbox", async () => {
		inputMock.mockResolvedValue("my-project");
		const entry: OptionsCommand = {
			name: "deploy cleanup-preview",
			options: [{ key: "project", flag: "--project", type: "input", message: "Project:", required: true }],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ project: "my-project" });
		expect(checkboxMock).not.toHaveBeenCalled();
		expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ message: "Project:" }));
	});

	it("skips prompting a required option already present in argv", async () => {
		const entry: OptionsCommand = {
			name: "deploy cleanup-preview",
			options: [{ key: "project", flag: "--project", type: "input", message: "Project:", required: true }],
		};
		const { answers } = await promptForOptions(entry, { project: "already-set" });
		expect(answers).toEqual({ project: "already-set" });
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("returns the declared options list unchanged alongside the answers", async () => {
		checkboxMock.mockResolvedValue([]);
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "initial", flag: "--initial", type: "confirm", message: "Initial?" }],
		};
		const { options } = await promptForOptions(entry, {});
		expect(options).toBe(entry.options);
	});

	it("offers only the optional options through one checkbox, and asks nothing further when none are picked", async () => {
		checkboxMock.mockResolvedValue([]);
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "initial", flag: "--initial", type: "confirm", message: "Initial?" }],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({});
		expect(checkboxMock).toHaveBeenCalledWith({
			message: "Set any options? (space to select, enter to skip)",
			choices: [{ name: "Initial?", value: "initial" }],
		});
		expect(confirmMock).not.toHaveBeenCalled();
	});

	it("prompts only the picked options, in declaration order", async () => {
		checkboxMock.mockResolvedValue(["tag"]);
		inputMock.mockResolvedValue("alpha");
		const entry: OptionsCommand = {
			name: "x",
			options: [
				{ key: "initial", flag: "--initial", type: "confirm", message: "Initial?" },
				{ key: "tag", flag: "--tag", type: "input", message: "Tag:" },
			],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ tag: "alpha" });
		expect(confirmMock).not.toHaveBeenCalled();
		expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ message: "Tag:" }));
	});

	it("skips a picked option whose `when` evaluates false against answers collected so far", async () => {
		checkboxMock.mockResolvedValue(["syncTrust", "initial"]);
		inputMock.mockResolvedValueOnce("old.yml").mockResolvedValueOnce("new.yml");
		const entry: OptionsCommand = {
			name: "x",
			options: [
				{ key: "syncTrust", flag: "--sync-trust", type: "input", arity: 2, message: "File:" },
				{
					key: "initial",
					flag: "--initial",
					type: "confirm",
					message: "Initial?",
					when: (a) => !a.syncTrust,
				},
			],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ syncTrust: ["old.yml", "new.yml"] });
		expect(confirmMock).not.toHaveBeenCalled();
	});

	it("prompts an arity option once per value and collects them as an array", async () => {
		checkboxMock.mockResolvedValue(["syncTrust"]);
		inputMock.mockResolvedValueOnce("old.yml").mockResolvedValueOnce("new.yml");
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "syncTrust", flag: "--sync-trust", type: "input", arity: 2, message: "File" }],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ syncTrust: ["old.yml", "new.yml"] });
		expect(inputMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: "File (1 of 2)" }));
		expect(inputMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: "File (2 of 2)" }));
	});

	it("prompts a secret option with password(), not input()", async () => {
		checkboxMock.mockResolvedValue(["otp"]);
		passwordMock.mockResolvedValue("123456");
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "otp", flag: "--otp", type: "password", secret: true, message: "OTP:" }],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ otp: "123456" });
		expect(passwordMock).toHaveBeenCalledWith({ message: "OTP:" });
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("prompts via select() and resolves a thunk `choices` at prompt time", async () => {
		checkboxMock.mockResolvedValue(["provider"]);
		selectMock.mockResolvedValue("github");
		const entry: OptionsCommand = {
			name: "x",
			options: [
				{
					key: "provider",
					flag: "--provider",
					type: "select",
					message: "Provider:",
					choices: () => ["github"],
				},
			],
		};
		const { answers } = await promptForOptions(entry, {});
		expect(answers).toEqual({ provider: "github" });
		expect(selectMock).toHaveBeenCalledWith({ message: "Provider:", choices: [{ value: "github" }] });
	});

	it("throws NonInteractiveError on non-TTY stdin before prompting a required option", async () => {
		setTTY(false);
		const entry: OptionsCommand = {
			name: "deploy cleanup-preview",
			options: [{ key: "project", flag: "--project", type: "input", message: "Project:", required: true }],
		};
		const err = await promptForOptions(entry, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("throws NonInteractiveError on non-TTY stdin before offering the checkbox", async () => {
		setTTY(false);
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "initial", flag: "--initial", type: "confirm", message: "Initial?" }],
		};
		const err = await promptForOptions(entry, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(checkboxMock).not.toHaveBeenCalled();
	});

	it("doesn't throw on non-TTY stdin when every option is already satisfied by argv", async () => {
		setTTY(false);
		const entry: OptionsCommand = {
			name: "x",
			options: [{ key: "initial", flag: "--initial", type: "confirm", message: "Initial?" }],
		};
		const { answers } = await promptForOptions(entry, { initial: true });
		expect(answers).toEqual({});
	});
});

describe("promptForOptions — modes", () => {
	beforeEach(() => {
		inputMock.mockReset();
		selectMock.mockReset();
		confirmMock.mockReset();
		checkboxMock.mockReset();
		passwordMock.mockReset();
		setTTY(true);
	});
	afterEach(() => setTTY(false));

	const entry: OptionsCommand = {
		name: "package publish",
		modes: [
			{
				key: "steady",
				message: "Publish (steady-state)",
				options: [{ key: "tag", flag: "--tag", type: "input", message: "Tag:" }],
			},
			{
				key: "initial",
				message: "Bootstrap",
				description: "Use only for a package's very first publish.",
				flag: "--initial",
				options: [{ key: "otp", flag: "--otp", type: "password", secret: true, message: "OTP:" }],
			},
			{ key: "syncTrust", message: "Sync Trust", options: [] },
		],
	};

	it("asks which mode first, via select(), with modes.message as the choice labels", async () => {
		selectMock.mockResolvedValue("steady");
		checkboxMock.mockResolvedValue([]);
		inputMock.mockResolvedValue("");
		await promptForOptions(entry, {});
		expect(selectMock).toHaveBeenCalledWith({
			message: "What would you like to do?",
			choices: [
				{ name: "Publish (steady-state)", value: "steady", description: undefined },
				{ name: "Bootstrap", value: "initial", description: "Use only for a package's very first publish." },
				{ name: "Sync Trust", value: "syncTrust", description: undefined },
			],
		});
	});

	it("offers only the picked mode's own options, ignoring the other modes entirely", async () => {
		selectMock.mockResolvedValue("steady");
		checkboxMock.mockResolvedValue([]);
		inputMock.mockResolvedValue("");
		await promptForOptions(entry, {});
		// "steady" has one optional option -- it goes behind the checkbox.
		expect(checkboxMock).toHaveBeenCalledWith(
			expect.objectContaining({ choices: [{ name: "Tag:", value: "tag" }] })
		);
		expect(passwordMock).not.toHaveBeenCalled();
	});

	it("folds the picked mode's own flag into the result as an already-true option, with no extra prompt", async () => {
		selectMock.mockResolvedValue("initial");
		checkboxMock.mockResolvedValue(["otp"]);
		passwordMock.mockResolvedValue("123456");
		const { options, answers } = await promptForOptions(entry, {});
		expect(answers).toMatchObject({ otp: "123456" });
		const modeFlagOption = options.find((o) => o.flag === "--initial");
		expect(modeFlagOption).toBeDefined();
		expect(answers[modeFlagOption!.key]).toBe(true);
		// confirm() is never called for the mode's own flag -- it's already resolved, not prompted.
		expect(confirmMock).not.toHaveBeenCalled();
	});

	it("adds no synthetic flag entry for a mode with no `flag` of its own (the default/steady-state case)", async () => {
		selectMock.mockResolvedValue("steady");
		checkboxMock.mockResolvedValue([]);
		inputMock.mockResolvedValue("");
		const { options } = await promptForOptions(entry, {});
		expect(options.some((o) => o.key.startsWith("__mode_"))).toBe(false);
	});

	it("never offers an option from a mode that wasn't picked", async () => {
		selectMock.mockResolvedValue("syncTrust");
		const { options, answers } = await promptForOptions(entry, {});
		expect(options.every((o) => o.key !== "tag" && o.key !== "otp")).toBe(true);
		expect(answers).toEqual({});
		expect(inputMock).not.toHaveBeenCalled();
		expect(passwordMock).not.toHaveBeenCalled();
	});

	it("throws NonInteractiveError on non-TTY stdin before asking which mode", async () => {
		setTTY(false);
		const err = await promptForOptions(entry, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(selectMock).not.toHaveBeenCalled();
	});
});
