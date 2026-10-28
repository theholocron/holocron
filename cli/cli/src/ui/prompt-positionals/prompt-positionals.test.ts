import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inputMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@inquirer/prompts", () => ({
	input: (...args: unknown[]) => inputMock(...args),
	select: (...args: unknown[]) => selectMock(...args),
}));

const { NonInteractiveError } = await import("../non-interactive-error/index.js");
const { promptForPositionals } = await import("./prompt-positionals.js");
import type { PositionalCommand } from "./prompt-positionals.type.js";

function setTTY(value: boolean): void {
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

const deploy: PositionalCommand = {
	name: "deploy",
	positionals: [{ key: "branch", message: "Branch:", type: "input" }],
};
const newPlugin: PositionalCommand = {
	name: "new plugin",
	positionals: [
		{ key: "slug", message: "Slug:", type: "input" },
		{ key: "vendor", message: "Vendor:", type: "input" },
	],
};
const bump: PositionalCommand = {
	name: "package bump-versions",
	positionals: [{ key: "newVersion", cliArg: "new-version", message: "Version:", type: "input" }],
};

describe("promptForPositionals", () => {
	beforeEach(() => {
		inputMock.mockReset();
		selectMock.mockReset();
		setTTY(true);
	});
	afterEach(() => setTTY(false));

	it("skips prompting when the value is already present in argv", async () => {
		const values = await promptForPositionals(deploy, { branch: "main" });
		expect(values).toEqual(["main"]);
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("prompts via input() for a missing input-type positional", async () => {
		inputMock.mockResolvedValue("my-secret");
		const values = await promptForPositionals(deploy, {});
		expect(values).toEqual(["my-secret"]);
		expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ message: "Branch:" }));
	});

	it("forwards a positional's validate function to input()", async () => {
		inputMock.mockResolvedValue("22");
		const entry: PositionalCommand = {
			name: "x",
			positionals: [
				{
					key: "pr",
					message: "PR:",
					type: "input",
					validate: (v) => (/^\d+$/.test(v) ? true : "enter a number"),
				},
			],
		};
		await promptForPositionals(entry, {});
		const call = inputMock.mock.calls[0]![0] as { validate: (v: string) => boolean | string };
		expect(call.validate("42")).toBe(true);
		expect(call.validate("nope")).toMatch(/number/);
	});

	it("prompts via select() for a static-choices select-type positional", async () => {
		selectMock.mockResolvedValue("github");
		const entry: PositionalCommand = {
			name: "x",
			positionals: [{ key: "provider", message: "Provider:", type: "select", choices: ["github", "vercel"] }],
		};
		const values = await promptForPositionals(entry, {});
		expect(values).toEqual(["github"]);
		expect(selectMock).toHaveBeenCalledWith({
			message: "Provider:",
			choices: [{ value: "github" }, { value: "vercel" }],
		});
	});

	it("resolves a thunk `choices` at prompt time", async () => {
		selectMock.mockResolvedValue("cloudflare");
		const entry: PositionalCommand = {
			name: "auth unset",
			positionals: [
				{ key: "provider", message: "Provider:", type: "select", choices: () => ["cloudflare", "github"] },
			],
		};
		const values = await promptForPositionals(entry, {});
		expect(values).toEqual(["cloudflare"]);
		expect(selectMock).toHaveBeenCalledWith(
			expect.objectContaining({ choices: [{ value: "cloudflare" }, { value: "github" }] })
		);
	});

	it("throws NonInteractiveError instead of prompting when a thunk resolves to nothing to choose from", async () => {
		const entry: PositionalCommand = {
			name: "auth unset",
			positionals: [{ key: "provider", message: "Provider:", type: "select", choices: () => [] }],
		};
		const err = await promptForPositionals(entry, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/nothing stored yet/);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("falls back to an empty list for a select-type positional with no choices at all", async () => {
		const entry: PositionalCommand = {
			name: "x",
			positionals: [{ key: "thing", message: "Thing:", type: "select" }],
		};
		const err = await promptForPositionals(entry, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("resolves multiple positionals in order", async () => {
		inputMock.mockResolvedValueOnce("my-slug").mockResolvedValueOnce("MyVendor");
		expect(await promptForPositionals(newPlugin, {})).toEqual(["my-slug", "MyVendor"]);
	});

	it("mixes present-in-argv and prompted positionals", async () => {
		inputMock.mockResolvedValue("MyVendor");
		const values = await promptForPositionals(newPlugin, { slug: "my-slug" });
		expect(values).toEqual(["my-slug", "MyVendor"]);
		expect(inputMock).toHaveBeenCalledTimes(1);
	});

	it("throws NonInteractiveError on non-TTY stdin instead of prompting", async () => {
		setTTY(false);
		const err = await promptForPositionals(deploy, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/holocron deploy <branch>/);
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("uses `cliArg` (the kebab-case positional) in the non-TTY hint when it differs from the argv key", async () => {
		setTTY(false);
		const err = await promptForPositionals(bump, {}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/holocron package bump-versions <new-version>/);
	});
});
