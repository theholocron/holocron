import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMMAND_CONTEXTS } from "./commands/contexts.js";

const inputMock = vi.fn();
const selectMock = vi.fn();
const confirmMock = vi.fn();
vi.mock("@inquirer/prompts", () => ({
	input: (...args: unknown[]) => inputMock(...args),
	select: (...args: unknown[]) => selectMock(...args),
	confirm: (...args: unknown[]) => confirmMock(...args),
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
	DRY_RUN_NOOP_EXIT_CODE,
	DRY_RUN_PREVIEW_ENV_VAR,
	BACK,
	forwardedFlags,
	getEntry,
	launchMenu,
	menuItems,
	NonInteractiveError,
	pickMenuItem,
	promptForPositionals,
	searchChoices,
	shouldPreviewDryRun,
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

	it("covers every command on the documented surface, except the CI/hook-only ones", () => {
		const excluded = new Set(["run", "run lint commit-msg"]);
		const missing = Object.keys(COMMAND_CONTEXTS)
			.filter((name) => !excluded.has(name))
			.filter((name) => !COMMAND_REGISTRY.some((e) => e.name === name));
		expect(missing).toEqual([]);
	});

	it("has no entry for a command outside the documented surface", () => {
		const stray = COMMAND_REGISTRY.map((e) => e.name).filter((name) => !(name in COMMAND_CONTEXTS));
		expect(stray).toEqual([]);
	});

	it("run is deliberately excluded (CI/scripting-oriented — no interactive fallback)", () => {
		expect(COMMAND_REGISTRY.some((e) => e.name === "run")).toBe(false);
	});
});

describe("menuItems — one level of the nested menu", () => {
	const names = (path: string[] = []) => menuItems(COMMAND_REGISTRY, path).map((i) => i.name);
	const valueOf = (name: string, path: string[] = []) =>
		menuItems(COMMAND_REGISTRY, path).find((i) => i.name === name)?.value;

	it("the top level shows one row per first word, with groups opening a submenu", () => {
		expect(valueOf("repo ›")).toBe("group:repo");
		expect(valueOf("auth ›")).toBe("group:auth");
		expect(valueOf("doctor")).toBe("doctor");
	});

	it("never shows a `<command> <subcommand>` path: every row at every level is one word", () => {
		const rows: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(COMMAND_REGISTRY, path)) {
				rows.push(item.name);
				if (item.value.startsWith("group:")) walk(item.value.slice("group:".length).split(" "));
			}
		};
		walk([]);
		const bad = rows.filter((n) =>
			n
				.replace(/ ›$/, "")
				.replace(/ \(run it\)$/, "")
				.includes(" ")
		);
		expect(bad).toEqual([]);
	});

	it("does not collapse a one-command group: `config show` is config › then show", () => {
		expect(names()).toContain("config ›");
		expect(names()).not.toContain("config show");
		expect(names(["config"])).toEqual(["show"]);
		expect(valueOf("show", ["config"])).toBe("config show");
		expect(names(["sync"])).toEqual(["github"]);
		expect(names(["run"])).toEqual(["ci"]);
		expect(valueOf("ci", ["run"])).toBe("run ci");
	});

	it("shows the next word under a group, and nests as deep as the names go", () => {
		expect(names(["repo"])).toEqual(["setup", "sync ›", "upgrade ›"]);
		expect(valueOf("setup", ["repo"])).toBe("repo setup");
		expect(valueOf("upgrade ›", ["repo"])).toBe("group:repo upgrade");
		expect(names(["repo", "upgrade"])).toEqual(["node", "deps"]);
		expect(valueOf("node", ["repo", "upgrade"])).toBe("repo upgrade node");
	});

	it("a group that is also runnable gets a leading `<word> (run it)` item (repo sync, deploy)", () => {
		const sync = menuItems(COMMAND_REGISTRY, ["repo", "sync"]);
		expect(sync[0]).toMatchObject({ name: "sync (run it)", value: "repo sync" });
		expect(sync.map((i) => i.value)).toContain("repo sync readme");
		const deploy = menuItems(COMMAND_REGISTRY, ["deploy"]);
		expect(deploy[0]).toMatchObject({ name: "deploy (run it)", value: "deploy" });
		expect(deploy.map((i) => i.value)).toEqual(["deploy", "deploy cleanup-preview", "deploy on-release"]);
	});

	it("a group's description lists its children, and its haystack covers everything under it", () => {
		const repo = menuItems(COMMAND_REGISTRY).find((i) => i.value === "group:repo")!;
		expect(repo.description).toBe("setup, sync, upgrade");
		expect(repo.haystack).toContain("repo upgrade node");
	});

	it("reaches every registered command exactly once by walking the tree", () => {
		const reached: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(COMMAND_REGISTRY, path)) {
				if (item.value.startsWith("group:")) walk(item.value.slice("group:".length).split(" "));
				else reached.push(item.value);
			}
		};
		walk([]);
		expect([...reached].sort()).toEqual(COMMAND_REGISTRY.map((e) => e.name).sort());
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

describe("pickMenuItem", () => {
	beforeEach(() => searchMock.mockReset());
	const items = menuItems(COMMAND_REGISTRY);

	it("resolves to the picked item's value", async () => {
		searchMock.mockResolvedValue("group:repo");
		expect(await pickMenuItem(items)).toBe("group:repo");
	});

	it("passes the message through to search()", async () => {
		searchMock.mockResolvedValue("auth set");
		await pickMenuItem(menuItems(COMMAND_REGISTRY, ["auth"]), "auth — choose a subcommand:");
		expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ message: "auth — choose a subcommand:" }));
	});

	it("wires its `source` callback straight to searchChoices", async () => {
		searchMock.mockResolvedValue("doctor");
		await pickMenuItem(items);
		const { source } = searchMock.mock.calls[0]![0] as {
			source: (term: string | undefined) => ReturnType<typeof searchChoices>;
		};
		expect(source("doctor")).toEqual(searchChoices(items, "doctor"));
	});
});

describe("searchChoices — the `source` callback pickMenuItem hands to search()", () => {
	const items = menuItems(COMMAND_REGISTRY);

	it("returns every item when the term is empty or undefined", () => {
		expect(searchChoices(items, undefined)).toHaveLength(items.length);
		expect(searchChoices(items, "")).toHaveLength(items.length);
	});

	it("filters out items that match neither the name nor the description", () => {
		expect(searchChoices(items, "zzz-no-such-command")).toEqual([]);
	});

	it("matches the name case-insensitively", () => {
		expect(searchChoices(items, "DOCTOR").map((c) => c.value)).toEqual(["doctor"]);
	});

	it("also matches on the description, not just the name", () => {
		// "secrets sync"'s description mentions "deployment env vars"; it sits inside the `secrets` group.
		expect(searchChoices(items, "deployment env vars").map((c) => c.value)).toContain("group:secrets");
	});

	it("finds a nested command from the top by name: `upgrade` surfaces the repo group", () => {
		expect(searchChoices(items, "upgrade").map((c) => c.value)).toContain("group:repo");
	});

	it("ranks name matches above description-only matches (typing `repo` lands on the repo group, not clone)", () => {
		const values = searchChoices(items, "repo").map((c) => c.value);
		expect(values[0]).toBe("group:repo");
		expect(values).toContain("clone");
		expect(values.indexOf("group:repo")).toBeLessThan(values.indexOf("clone"));
	});

	it("ranks a name prefix above a name substring (`up` → upgrade before setup)", () => {
		const values = searchChoices(menuItems(COMMAND_REGISTRY, ["repo"]), "up").map((c) => c.value);
		expect(values).toEqual(["group:repo upgrade", "repo setup"]);
	});

	it("each choice carries name, value, and description", () => {
		const [choice] = searchChoices(items, "doctor");
		expect(choice).toEqual({ name: "doctor", value: "doctor", description: getEntry("doctor").description });
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
		const values = await promptForPositionals(getEntry("secrets set"), {});
		expect(values).toEqual(["my-secret"]);
		expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({ message: "Secret name:" }));
	});

	it("forwards a positional's validate function to input()", async () => {
		inputMock.mockResolvedValue("22");
		await promptForPositionals(getEntry("deploy cleanup-preview"), {});
		const call = inputMock.mock.calls[0]![0] as { validate: (v: string) => boolean | string };
		expect(call.validate("42")).toBe(true);
		expect(call.validate("nope")).toMatch(/number/);
	});

	it("validates clone's target positional — org/repo or a bare org both pass, only empty input doesn't", async () => {
		inputMock.mockResolvedValue("theholocron/holocron");
		await promptForPositionals(getEntry("clone"), {});
		const call = inputMock.mock.calls[0]![0] as { validate: (v: string) => boolean | string };
		expect(call.validate("theholocron/holocron")).toBe(true);
		expect(call.validate("theholocron")).toBe(true);
		expect(call.validate("   ")).toMatch(/required/);
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
		const values = await promptForPositionals(getEntry("new plugin"), {});
		expect(values).toEqual(["my-slug", "MyVendor"]);
	});

	it("mixes present-in-argv and prompted positionals", async () => {
		inputMock.mockResolvedValue("MyVendor");
		const values = await promptForPositionals(getEntry("new plugin"), { slug: "my-slug" });
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
		const err = await promptForPositionals(getEntry("package bump-versions"), {}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/holocron package bump-versions <new-version>/);
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

	it("dryRunOverride wins over argv.dryRun in both directions", () => {
		expect(forwardedFlags({ dryRun: false }, true)).toEqual(["--dry-run"]);
		expect(forwardedFlags({ dryRun: true }, false)).toEqual([]);
	});

	it("falls back to argv.dryRun when no override is passed", () => {
		expect(forwardedFlags({ dryRun: true })).toEqual(["--dry-run"]);
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

	it("passes a dryRunOverride through to forwardedFlags", () => {
		expect(buildChildArgv(getEntry("doctor"), [], {}, true)).toEqual(["doctor", "--dry-run"]);
		expect(buildChildArgv(getEntry("doctor"), [], { dryRun: true }, false)).toEqual(["doctor"]);
	});
});

describe("shouldPreviewDryRun", () => {
	it("true for a dry-run-capable command by default", () => {
		expect(shouldPreviewDryRun(getEntry("doctor"), {})).toBe(true);
		expect(shouldPreviewDryRun(getEntry("doctor"), { skipDryRun: false })).toBe(true);
	});

	it("false when --skip-dry-run was passed — opts out of the preview entirely", () => {
		expect(shouldPreviewDryRun(getEntry("doctor"), { skipDryRun: true })).toBe(false);
	});

	it("false for a command whose handler doesn't honour --dry-run", () => {
		expect(shouldPreviewDryRun(getEntry("auth set"), {})).toBe(false);
	});
});

describe("launchMenu", () => {
	beforeEach(() => {
		searchMock.mockReset();
		spawnMock.mockReset();
		confirmMock.mockReset();
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
		const done = launchMenu(COMMAND_REGISTRY, { org: "theholocron", skipDryRun: true });
		// let the promise chain reach spawnChild's `new Promise` before firing exit
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 3);
		await done;

		expect(spawnMock).toHaveBeenCalledWith(process.execPath, [process.argv[1], "doctor", "--org", "theholocron"], {
			stdio: "inherit",
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
		});
		expect(process.exitCode).toBe(3);
		process.exitCode = original;
	});

	it("opens a group's submenu, then a nested group, then runs the command it ends on", async () => {
		setTTY(true);
		searchMock
			.mockResolvedValueOnce("group:repo")
			.mockResolvedValueOnce("group:repo upgrade")
			.mockResolvedValueOnce("repo upgrade deps");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		const messages = searchMock.mock.calls.map((c) => (c[0] as { message: string }).message);
		expect(messages).toEqual([
			"What would you like to do?",
			"repo — choose a subcommand:",
			"repo upgrade — choose a subcommand:",
		]);
		expect(spawnMock.mock.calls[0]![1]).toEqual([process.argv[1], "repo", "upgrade", "deps"]);
	});

	it("offers ← back below the first level only, and back returns to the previous level", async () => {
		setTTY(true);
		searchMock.mockResolvedValueOnce("group:repo").mockResolvedValueOnce(BACK).mockResolvedValueOnce("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		const levels = searchMock.mock.calls.map((c) => c[0] as { source: (t?: string) => Array<{ value: string }> });
		expect(levels[0]!.source().map((i) => i.value)).not.toContain(BACK);
		expect(levels[1]!.source().map((i) => i.value)).toContain(BACK);
		// third prompt is the top level again, after going back
		expect(levels[2]!.source().map((i) => i.value)).toContain("group:repo");
		expect(spawnMock.mock.calls[0]![1]).toEqual([process.argv[1], "doctor"]);
	});

	it("starts at `startPath` (a bare group command) without a back item at that level", async () => {
		setTTY(true);
		searchMock.mockResolvedValueOnce("repo setup");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true }, "repo — choose a subcommand:", undefined, [
			"repo",
		]);
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		const level = searchMock.mock.calls[0]![0] as {
			message: string;
			source: (t?: string) => Array<{ value: string }>;
		};
		expect(level.message).toBe("repo — choose a subcommand:");
		expect(level.source().map((i) => i.value)).toEqual(["repo setup", "group:repo sync", "group:repo upgrade"]);
		expect(spawnMock.mock.calls[0]![1]).toEqual([process.argv[1], "repo", "setup"]);
	});

	it("runs a runnable group itself via its leading `(run it)` item", async () => {
		setTTY(true);
		searchMock
			.mockResolvedValueOnce("group:repo")
			.mockResolvedValueOnce("group:repo sync")
			.mockResolvedValueOnce("repo sync");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		expect(spawnMock.mock.calls[0]![1]).toEqual([process.argv[1], "repo", "sync"]);
	});

	it("suppresses the child's own update check — the parent's tail notifier already covers it", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		const [, , options] = spawnMock.mock.calls[0] as [unknown, unknown, { env: Record<string, string> }];
		expect(options.env["NO_UPDATE_NOTIFIER"]).toBe("1");
	});

	it("treats a null child exit code as 0", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", null);
		await done;

		expect(process.exitCode).toBe(0);
		process.exitCode = original;
	});

	it("resolves 1 when spawn itself errors", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
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

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
		child.emit("exit", 0);
		await done;

		expect(spawnMock).toHaveBeenCalledWith(process.execPath, [process.argv[1], "deploy", "main"], {
			stdio: "inherit",
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
		});
	});

	const spawnArgs = (cmd: string[], extraEnv: Record<string, string> = {}) => [
		process.execPath,
		[process.argv[1], ...cmd],
		{ stdio: "inherit", env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...extraEnv } },
	];
	const dryRunPreviewArgs = (cmd: string[]) => spawnArgs([...cmd, "--dry-run"], { [DRY_RUN_PREVIEW_ENV_VAR]: "1" });

	it("auto-previews a dry-run-capable command with no upfront question, then runs for real on yes", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		confirmMock.mockResolvedValueOnce(true); // proceed with the real run? (the only question asked)
		const dryChild = new EventEmitter();
		const realChild = new EventEmitter();
		spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		expect(spawnMock).toHaveBeenNthCalledWith(1, ...dryRunPreviewArgs(["doctor"]));
		dryChild.emit("exit", 0);

		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
		expect(spawnMock).toHaveBeenNthCalledWith(2, ...spawnArgs(["doctor"]));
		realChild.emit("exit", 0);
		await done;

		expect(confirmMock).toHaveBeenCalledTimes(1);
		expect(process.exitCode).toBe(0);
		process.exitCode = original;
	});

	it("stops after a clean preview when the user declines the real run", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		confirmMock.mockResolvedValueOnce(false); // proceed with the real run?
		const dryChild = new EventEmitter();
		spawnMock.mockReturnValueOnce(dryChild);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		dryChild.emit("exit", 0);
		await done;

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(process.exitCode).toBe(0);
		process.exitCode = original;
	});

	it("stops and surfaces the exit code when the preview itself fails — never asks to proceed", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const dryChild = new EventEmitter();
		spawnMock.mockReturnValueOnce(dryChild);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		dryChild.emit("exit", 1);
		await done;

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(process.exitCode).toBe(1);
		expect(confirmMock).not.toHaveBeenCalled();
		process.exitCode = original;
	});

	it("stops cleanly without asking to proceed when the preview reports nothing would change", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const dryChild = new EventEmitter();
		spawnMock.mockReturnValueOnce(dryChild);

		const original = process.exitCode;
		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		expect(spawnMock).toHaveBeenNthCalledWith(1, ...dryRunPreviewArgs(["doctor"]));
		dryChild.emit("exit", DRY_RUN_NOOP_EXIT_CODE);
		await done;

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(process.exitCode).toBe(0);
		expect(confirmMock).not.toHaveBeenCalled();
		process.exitCode = original;
	});

	it("--skip-dry-run opts out of the preview entirely, running for real immediately", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("doctor");
		const child = new EventEmitter();
		spawnMock.mockReturnValueOnce(child);

		const done = launchMenu(COMMAND_REGISTRY, { skipDryRun: true });
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		expect(spawnMock).toHaveBeenNthCalledWith(1, ...spawnArgs(["doctor"]));
		child.emit("exit", 0);
		await done;

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(confirmMock).not.toHaveBeenCalled();
	});

	it("a command that doesn't support --dry-run never previews", async () => {
		setTTY(true);
		searchMock.mockResolvedValue("auth set");
		inputMock.mockResolvedValue("github");
		const child = new EventEmitter();
		spawnMock.mockReturnValueOnce(child);

		const done = launchMenu(COMMAND_REGISTRY, {});
		await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
		child.emit("exit", 0);
		await done;

		expect(confirmMock).not.toHaveBeenCalled();
	});
});
