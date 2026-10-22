import { EventEmitter } from "node:events";

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

const searchMock = vi.fn();
vi.mock("@inquirer/search", () => ({ default: (...args: unknown[]) => searchMock(...args) }));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const listStoredProvidersMock = vi.fn();
vi.mock("../../auth/keyring/keyring.js", () => ({ listStoredProviders: () => listStoredProvidersMock() }));

const { COMMAND_REGISTRY, getEntry } = await import("../command-registry/index.js");
const { BACK } = await import("../menu-items/index.js");
const { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR, launchMenu, shouldPreviewDryRun } =
	await import("../launch-menu/index.js");
const { NonInteractiveError } = await import("../../ui/index.js");

function setTTY(value: boolean): void {
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

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
		checkboxMock.mockReset();
		passwordMock.mockReset();
		inputMock.mockReset();
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

	describe("options (holocron#1052)", () => {
		it("asks which mode first, then offers only that mode's own optional options", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("initial"); // "What would you like to do?"
			checkboxMock.mockResolvedValue([]); // nothing further picked
			confirmMock.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			expect(selectMock).toHaveBeenCalledWith(expect.objectContaining({ message: "What would you like to do?" }));
			// Picking "initial" implies --initial unconditionally, with no
			// further prompt for it -- it's already resolved by the pick itself.
			expect(spawnMock.mock.calls[0]![1]).toEqual([
				process.argv[1],
				"package",
				"publish",
				"--initial",
				"--dry-run",
			]);
			dryChild.emit("exit", 0);

			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			expect(spawnMock.mock.calls[1]![1]).toEqual([process.argv[1], "package", "publish", "--initial"]);
			realChild.emit("exit", 0);
			await done;
		});

		it("never offers an unrelated mode's options at all, not just unprompted — picking syncTrust never shows initial/tag/provenance", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("syncTrust");
			inputMock.mockResolvedValueOnce("old.yml").mockResolvedValueOnce("new.yml"); // required --sync-trust
			checkboxMock.mockResolvedValue([]); // --repo not picked
			confirmMock.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			// The checkbox for this mode offers only its own option (--repo) --
			// --initial/--tag/--otp/--provenance/--skip-already-published, which
			// belong to the other two modes, are never even in the choices list.
			expect(checkboxMock).toHaveBeenCalledWith(
				expect.objectContaining({ choices: [{ name: expect.stringContaining("owner/repo"), value: "repo" }] })
			);
			expect(spawnMock.mock.calls[0]![1]).toEqual([
				process.argv[1],
				"package",
				"publish",
				"--sync-trust",
				"old.yml",
				"new.yml",
				"--dry-run",
			]);
			dryChild.emit("exit", 0);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			realChild.emit("exit", 0);
			await done;
		});

		it("delivers a secret option through the child's env, never its argv, collected last (after the proceed? confirm)", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("initial");
			checkboxMock.mockResolvedValue(["otp"]);
			passwordMock.mockResolvedValue("123456");
			confirmMock.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			// otp is askLast -- the dry run never prompts for it at all (it
			// never reaches the real npm call that would need it either),
			// even though passwordMock is already primed to resolve.
			expect(passwordMock).not.toHaveBeenCalled();
			const [, dryArgs, dryOpts] = spawnMock.mock.calls[0] as [
				unknown,
				string[],
				{ env: Record<string, string> },
			];
			expect(dryArgs).not.toContain("--otp");
			expect(dryOpts.env["HOLOCRON_OTP"]).toBeUndefined();
			dryChild.emit("exit", 0);

			// Only now, after "proceed with the real run?", is otp finally
			// collected -- as close as possible to when it's actually used.
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			expect(passwordMock).toHaveBeenCalledWith({ message: expect.stringContaining("One-time password") });
			const [, realArgs, realOpts] = spawnMock.mock.calls[1] as [
				unknown,
				string[],
				{ env: Record<string, string> },
			];
			expect(realArgs).not.toContain("--otp");
			expect(realArgs).not.toContain("123456");
			expect(realOpts.env["HOLOCRON_OTP"]).toBe("123456");
			realChild.emit("exit", 0);
			await done;
		});

		it("asks nothing extra when the steady-state mode is picked with no optional option", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("steady");
			checkboxMock.mockResolvedValue([]);
			confirmMock.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			expect(spawnMock.mock.calls[0]![1]).toEqual([process.argv[1], "package", "publish", "--dry-run"]);
			dryChild.emit("exit", 0);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			realChild.emit("exit", 0);
			await done;
		});

		it("syncTrust's own option is always prompted (required) and its value renders with arity 2", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("syncTrust");
			inputMock
				.mockResolvedValueOnce("old.yml")
				.mockResolvedValueOnce("new.yml")
				.mockResolvedValueOnce("theholocron/other-repo");
			checkboxMock.mockResolvedValue(["repo"]);
			confirmMock.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			expect(spawnMock.mock.calls[0]![1]).toEqual([
				process.argv[1],
				"package",
				"publish",
				"--sync-trust",
				"old.yml",
				"new.yml",
				"--repo",
				"theholocron/other-repo",
				"--dry-run",
			]);
			dryChild.emit("exit", 0);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			realChild.emit("exit", 0);
			await done;
		});

		it("the steady-state mode's own non-deferred options (tag, provenance, skip-already-published) all prompt together; otp waits until the real run", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("package publish");
			selectMock.mockResolvedValue("steady");
			checkboxMock.mockResolvedValue(["tag", "otp", "provenance", "skipAlreadyPublished"]);
			inputMock.mockResolvedValueOnce("alpha"); // --tag
			passwordMock.mockResolvedValue("123456"); // --otp (secret, askLast)
			confirmMock
				.mockResolvedValueOnce(false) // --provenance (negatable, default true)
				.mockResolvedValueOnce(true) // --skip-already-published
				.mockResolvedValueOnce(true); // proceed with the real run?
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			expect(passwordMock).not.toHaveBeenCalled();
			const [, dryArgs, dryOpts] = spawnMock.mock.calls[0] as [
				unknown,
				string[],
				{ env: Record<string, string> },
			];
			expect(dryArgs).toEqual([
				process.argv[1],
				"package",
				"publish",
				"--tag",
				"alpha",
				"--no-provenance",
				"--skip-already-published",
				"--dry-run",
			]);
			expect(dryOpts.env["HOLOCRON_OTP"]).toBeUndefined();
			dryChild.emit("exit", 0);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			expect(passwordMock).toHaveBeenCalled();
			const [, , realOpts] = spawnMock.mock.calls[1] as [unknown, string[], { env: Record<string, string> }];
			expect(realOpts.env["HOLOCRON_OTP"]).toBe("123456");
			realChild.emit("exit", 0);
			await done;
		});

		it("never calls checkbox for a command with no declared options", async () => {
			setTTY(true);
			searchMock.mockResolvedValue("doctor");
			confirmMock.mockResolvedValueOnce(true);
			const dryChild = new EventEmitter();
			const realChild = new EventEmitter();
			spawnMock.mockReturnValueOnce(dryChild).mockReturnValueOnce(realChild);

			const done = launchMenu(COMMAND_REGISTRY, {});
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			dryChild.emit("exit", 0);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
			realChild.emit("exit", 0);
			await done;

			expect(checkboxMock).not.toHaveBeenCalled();
		});
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
