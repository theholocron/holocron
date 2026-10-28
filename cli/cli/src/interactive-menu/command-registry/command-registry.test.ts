import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMMAND_CONTEXTS } from "../../commands/contexts/index.js";

const inputMock = vi.fn();
const selectMock = vi.fn();
const confirmMock = vi.fn();
vi.mock("@inquirer/prompts", () => ({
	input: (...args: unknown[]) => inputMock(...args),
	select: (...args: unknown[]) => selectMock(...args),
	confirm: (...args: unknown[]) => confirmMock(...args),
}));

const listStoredProvidersMock = vi.fn();
vi.mock("../../auth/keyring/keyring.js", () => ({ listStoredProviders: () => listStoredProvidersMock() }));

const { COMMAND_REGISTRY, getEntry } = await import("../command-registry/index.js");
const { NonInteractiveError, promptForPositionals } = await import("../../ui/index.js");

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

	it("covers every command on the documented surface, except run (dynamically merged in), the hook-only one, and the CI-only ones", () => {
		// `monitoring resolve-checks`/`monitoring run-resolved`
		// (holocron#1030/#1032) are the two halves of the
		// delivery.previewCheck split -- meant for CI, not a human
		// navigating `holocron monitoring` interactively. Neither calls
		// `promptForPositionals`/`getEntry`, so omitting them here has no
		// effect on their own long-form CLI invocation.
		const excluded = new Set([
			"run",
			"run lint commit-msg",
			"monitoring resolve-checks",
			"monitoring run-resolved",
		]);
		const missing = Object.keys(COMMAND_CONTEXTS)
			.filter((name) => !excluded.has(name))
			.filter((name) => !COMMAND_REGISTRY.some((e) => e.name === name));
		expect(missing).toEqual([]);
	});

	it("has no entry for a command outside the documented surface", () => {
		const stray = COMMAND_REGISTRY.map((e) => e.name).filter((name) => !(name in COMMAND_CONTEXTS));
		expect(stray).toEqual([]);
	});

	it("run has no entry of its own — cli.ts merges in buildRunMenuEntries(listRunnableTasks(argv)) instead", () => {
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

describe("COMMAND_REGISTRY positionals (prompted through promptForPositionals)", () => {
	beforeEach(() => {
		inputMock.mockReset();
		selectMock.mockReset();
		listStoredProvidersMock.mockReset();
		setTTY(true);
	});
	afterEach(() => setTTY(false));

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

	it("resolves auth unset's thunk choices from the stored providers (no fixed provider set)", async () => {
		listStoredProvidersMock.mockReturnValue(["cloudflare", "github"]);
		selectMock.mockResolvedValue("cloudflare");
		const values = await promptForPositionals(getEntry("auth unset"), {});
		expect(values).toEqual(["cloudflare"]);
		expect(selectMock).toHaveBeenCalledWith(
			expect.objectContaining({ choices: [{ value: "cloudflare" }, { value: "github" }] })
		);
	});

	it("throws NonInteractiveError for auth unset when there are no stored providers to choose from", async () => {
		listStoredProvidersMock.mockReturnValue([]);
		const err = await promptForPositionals(getEntry("auth unset"), {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/nothing stored yet/);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("resolves a multi-positional entry in order (new plugin)", async () => {
		inputMock.mockResolvedValueOnce("my-slug").mockResolvedValueOnce("MyVendor");
		expect(await promptForPositionals(getEntry("new plugin"), {})).toEqual(["my-slug", "MyVendor"]);
	});

	it("uses `cliArg` in the non-TTY hint for package bump-versions", async () => {
		setTTY(false);
		const err = await promptForPositionals(getEntry("package bump-versions"), {}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/holocron package bump-versions <new-version>/);
	});
});

// `PUBLISH_OTP_OPTION`'s `required` is computed once, at module load, from
// HOLOCRON_NPM_ENFORCE_2FA -- vi.resetModules() + a fresh dynamic import is needed
// to see each state; env.get() itself re-reads process.env on every call,
// but that one-time computation already baked a boolean into the object by
// the time any later read would happen (holocron#1052 follow-up).
describe("package publish's otp option — HOLOCRON_NPM_ENFORCE_2FA (holocron#1052 follow-up)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	function otpOption(registry: typeof COMMAND_REGISTRY) {
		const publish = registry.find((e) => e.name === "package publish")!;
		const steady = publish.modes!.find((m) => m.key === "steady")!;
		return steady.options!.find((o) => o.key === "otp")!;
	}

	it("is checkbox-optional by default, still askLast", async () => {
		vi.resetModules();
		const { COMMAND_REGISTRY: registry } = await import("./command-registry.js");
		const otp = otpOption(registry);
		expect(otp.required).toBe(false);
		expect(otp.askLast).toBe(true);
	});

	it("becomes required (but still askLast) when HOLOCRON_NPM_ENFORCE_2FA is set — an operator whose own npm account always enforces 2FA skips checking the box every run", async () => {
		vi.stubEnv("HOLOCRON_NPM_ENFORCE_2FA", "1");
		vi.resetModules();
		const { COMMAND_REGISTRY: registry } = await import("./command-registry.js");
		const otp = otpOption(registry);
		expect(otp.required).toBe(true);
		expect(otp.askLast).toBe(true);
	});
});
