import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inputMock = vi.fn();
const selectMock = vi.fn();
vi.mock("@inquirer/prompts", () => ({
	input: (...args: unknown[]) => inputMock(...args),
	select: (...args: unknown[]) => selectMock(...args),
}));

const searchMock = vi.fn();
vi.mock("@inquirer/search", () => ({ default: (...args: unknown[]) => searchMock(...args) }));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const listStoredProvidersMock = vi.fn();
vi.mock("./auth/keyring.js", () => ({ listStoredProviders: () => listStoredProvidersMock() }));

const {
	buildChildArgv,
	COMMAND_REGISTRY,
	forwardedFlags,
	getEntry,
	launchMenu,
	NonInteractiveError,
	pickCommand,
	promptForPositionals,
	searchChoices,
} = await import("./interactive-menu.js");

function setTTY(value: boolean): void {
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

describe("COMMAND_REGISTRY", () => {
	it("has no duplicate names", () => {
		const names = COMMAND_REGISTRY.map((e) => e.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("every select-type positional declares choices", () => {
		const selectPositionals = COMMAND_REGISTRY.flatMap((e) => e.positionals).filter((p) => p.type === "select");
		expect(selectPositionals.length).toBeGreaterThan(0);
		expect(selectPositionals.every((p) => p.choices !== undefined)).toBe(true);
	});

	it("groups are limited to the three known parent commands", () => {
		const groups = new Set(COMMAND_REGISTRY.map((e) => e.group).filter(Boolean));
		expect(groups).toEqual(new Set(["auth", "skills", "upgrade"]));
	});

	it("run is deliberately excluded (CI/scripting-oriented — no interactive fallback)", () => {
		expect(COMMAND_REGISTRY.some((e) => e.name === "run")).toBe(false);
	});
});

describe("getEntry", () => {
	it("returns the matching registry entry", () => {
		expect(getEntry("deploy").name).toBe("deploy");
	});

	it("throws for an unknown name", () => {
		expect(() => getEntry("does-not-exist")).toThrow(/no COMMAND_REGISTRY entry/);
	});
});

describe("pickCommand", () => {
	beforeEach(() => searchMock.mockReset());

	it("resolves the selected value back to its CommandEntry", async () => {
		searchMock.mockResolvedValue("version");
		const picked = await pickCommand(COMMAND_REGISTRY);
		expect(picked).toBe(getEntry("version"));
	});

	it("passes the message through to search()", async () => {
		searchMock.mockResolvedValue("auth set");
		await pickCommand(
			COMMAND_REGISTRY.filter((e) => e.group === "auth"),
			"auth — choose a subcommand:"
		);
		expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ message: "auth — choose a subcommand:" }));
	});

	it("wires its `source` callback straight to searchChoices", async () => {
		searchMock.mockResolvedValue("version");
		await pickCommand(COMMAND_REGISTRY);
		const { source } = searchMock.mock.calls[0]![0] as {
			source: (term: string | undefined) => ReturnType<typeof searchChoices>;
		};
		expect(source("doctor")).toEqual(searchChoices(COMMAND_REGISTRY, "doctor"));
	});
});

describe("searchChoices — the `source` callback pickCommand hands to search()", () => {
	it("returns every entry when the term is empty or undefined", () => {
		expect(searchChoices(COMMAND_REGISTRY, undefined)).toHaveLength(COMMAND_REGISTRY.length);
		expect(searchChoices(COMMAND_REGISTRY, "")).toHaveLength(COMMAND_REGISTRY.length);
	});

	it("filters out entries that match neither the name nor the description", () => {
		const choices = searchChoices(COMMAND_REGISTRY, "zzz-no-such-command");
		expect(choices).toEqual([]);
	});

	it("matches the name case-insensitively", () => {
		const choices = searchChoices(COMMAND_REGISTRY, "DOCTOR");
		expect(choices.map((c) => c.value)).toEqual(["doctor"]);
	});

	it("also matches on the description, not just the name", () => {
		// "secrets sync"'s description mentions "deployment env vars" — no "deploy" in its name.
		const choices = searchChoices(COMMAND_REGISTRY, "deployment env vars");
		expect(choices.map((c) => c.value)).toEqual(["secrets sync"]);
	});

	it("each choice carries name, value, and description", () => {
		const [choice] = searchChoices(COMMAND_REGISTRY, "version");
		expect(choice).toEqual({ name: "version", value: "version", description: getEntry("version").description });
	});
});

describe("promptForPositionals", () => {
	beforeEach(() => {
		inputMock.mockReset();
		selectMock.mockReset();
		listStoredProvidersMock.mockReset();
		setTTY(true);
	});
	afterEach(() => setTTY(false));

	it("skips prompting when the value is already present in argv", async () => {
		const values = await promptForPositionals(getEntry("deploy"), { branch: "main" });
		expect(values).toEqual(["main"]);
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("prompts via input() for a missing input-type positional", async () => {
		inputMock.mockResolvedValue("my-secret");
		const values = await promptForPositionals(getEntry("secret set"), {});
		expect(values).toEqual(["my-secret"]);
		expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ message: "Secret name:" }));
	});

	it("forwards a positional's validate function to input()", async () => {
		inputMock.mockResolvedValue("22");
		await promptForPositionals(getEntry("cleanup-preview"), {});
		const call = inputMock.mock.calls[0]![0] as { validate: (v: string) => boolean | string };
		expect(call.validate("42")).toBe(true);
		expect(call.validate("nope")).toMatch(/number/);
	});

	it("prompts via select() for a static-choices select-type positional", async () => {
		selectMock.mockResolvedValue("github");
		const entry = {
			name: "x",
			description: "d",
			positionals: [
				{ key: "provider", message: "Provider:", type: "select" as const, choices: ["github", "vercel"] },
			],
		};
		const values = await promptForPositionals(entry, {});
		expect(values).toEqual(["github"]);
		expect(selectMock).toHaveBeenCalledWith({
			message: "Provider:",
			choices: [{ value: "github" }, { value: "vercel" }],
		});
	});

	it("resolves a thunk `choices` at prompt time (auth unset/check — stored providers, no fixed set)", async () => {
		listStoredProvidersMock.mockReturnValue(["cloudflare", "github"]);
		selectMock.mockResolvedValue("cloudflare");
		const values = await promptForPositionals(getEntry("auth unset"), {});
		expect(values).toEqual(["cloudflare"]);
		expect(selectMock).toHaveBeenCalledWith(
			expect.objectContaining({ choices: [{ value: "cloudflare" }, { value: "github" }] })
		);
	});

	it("throws NonInteractiveError instead of prompting when there are no stored providers to choose from", async () => {
		listStoredProvidersMock.mockReturnValue([]);
		const err = await promptForPositionals(getEntry("auth unset"), {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/nothing stored yet/);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("resolves multiple positionals in order", async () => {
		inputMock.mockResolvedValueOnce("my-slug").mockResolvedValueOnce("MyVendor");
		const values = await promptForPositionals(getEntry("plugin create"), {});
		expect(values).toEqual(["my-slug", "MyVendor"]);
	});

	it("mixes present-in-argv and prompted positionals", async () => {
		inputMock.mockResolvedValue("MyVendor");
		const values = await promptForPositionals(getEntry("plugin create"), { slug: "my-slug" });
		expect(values).toEqual(["my-slug", "MyVendor"]);
		expect(inputMock).toHaveBeenCalledTimes(1);
	});

	it("throws NonInteractiveError on non-TTY stdin instead of prompting", async () => {
		setTTY(false);
		const err = await promptForPositionals(getEntry("deploy"), {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/holocron deploy <branch>/);
		expect(inputMock).not.toHaveBeenCalled();
	});

	it("uses `cliArg` (the kebab-case positional) in the non-TTY hint when it differs from the argv key", async () => {
		setTTY(false);
		const err = await promptForPositionals(getEntry("bump-versions"), {}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/holocron bump-versions <new-version>/);
	});
});

describe("forwardedFlags", () => {
	it("forwards repeated --token entries", () => {
		expect(forwardedFlags({ token: ["github=x", "vercel=y"] })).toEqual([
			"--token",
			"github=x",
			"--token",
			"vercel=y",
		]);
	});

	it("forwards --org, --cwd, and --dry-run when present", () => {
		expect(forwardedFlags({ org: "theholocron", cwd: "/repo", dryRun: true })).toEqual([
			"--org",
			"theholocron",
			"--cwd",
			"/repo",
			"--dry-run",
		]);
	});

	it("omits flags that are absent or false", () => {
		expect(forwardedFlags({ dryRun: false })).toEqual([]);
		expect(forwardedFlags({})).toEqual([]);
	});
});

describe("buildChildArgv", () => {
	it("splits a multi-word command name into tokens", () => {
		expect(buildChildArgv(getEntry("auth set"), ["github"], {})).toEqual(["auth", "set", "github"]);
	});

	it("appends resolved positionals then forwarded flags, in order", () => {
		expect(buildChildArgv(getEntry("deploy"), ["main"], { dryRun: true, org: "theholocron" })).toEqual([
			"deploy",
			"main",
			"--org",
			"theholocron",
			"--dry-run",
		]);
	});

	it("handles a command with no positionals", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {})).toEqual(["doctor"]);
	});
});

describe("launchMenu", () => {
	beforeEach(() => {
		searchMock.mockReset();
		spawnMock.mockReset();
	});
	afterEach(() => setTTY(false));

	it("throws NonInteractiveError instead of picking on non-TTY stdin", async () => {
		setTTY(false);
		const err = await launchMenu(COMMAND_REGISTRY, {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("picks a command, spawns it, and sets process.exitCode from the child", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, { org: "theholocron" });
		// let the promise chain reach spawnChild's `new Promise` before firing exit
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 3);
		await done;

		expect(spawnMock).toHaveBeenCalledWith(process.execPath, [process.argv[1], "doctor", "--org", "theholocron"], {
			stdio: "inherit",
		});
		expect(process.exitCode).toBe(3);
		process.exitCode = original;
	});

	it("treats a null child exit code as 0", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("version");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", null);
		await done;

		expect(process.exitCode).toBe(0);
		process.exitCode = original;
	});

	it("resolves 1 when spawn itself errors", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("version");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("error", new Error("ENOENT"));
		await done;

		expect(process.exitCode).toBe(1);
		process.exitCode = original;
	});

	it("prompts for required positionals of the picked command before spawning", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("deploy");
		inputMock.mockResolvedValue("main");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		expect(spawnMock).toHaveBeenCalledWith(process.execPath, [process.argv[1], "deploy", "main"], {
			stdio: "inherit",
		});
	});
});
