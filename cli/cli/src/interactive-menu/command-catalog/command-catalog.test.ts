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
vi.mock("../../auth/index.js", () => ({ keyring: { list: () => listStoredProvidersMock() } }));

const { COMMAND_REGISTRY, getEntry } = await import("./index.js");
const { menuItems } = await import("@theholocron/kyber/menu");
const { NonInteractiveError } = await import("@theholocron/kyber/ui");
const { promptForPositionals } = await import("@theholocron/kyber/prompts");

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
		// `resolve checks`/`check resolved`
		// (holocron#1030/#1032) are the two halves of the
		// delivery.previewCheck split -- meant for CI, not a human
		// navigating `holocron monitoring` interactively. Neither calls
		// `promptForPositionals`/`getEntry`, so omitting them here has no
		// effect on their own long-form CLI invocation.
		// `deploy stage` is a build step of a package's `delivery.deploy` (it takes only flags).
		// `dev` takes the application's command after `--`, which a prompt cannot collect (the same reason as `run`).
		const excluded = new Set([
			"run",
			"dev",
			"dev serve",
			"run lint commit-msg",
			"resolve checks",
			"check resolved",
			"deploy stage",
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

describe("COMMAND_REGISTRY as a menu (rendered by kyber's menuItems)", () => {
	const names = (path: string[] = []) => menuItems(COMMAND_REGISTRY, path).map((i) => i.name);
	const valueOf = (name: string, path: string[] = []) =>
		menuItems(COMMAND_REGISTRY, path).find((i) => i.name === name)?.value;

	it("the top level shows one row per first word, with groups opening a submenu", () => {
		expect(valueOf("upgrade ›")).toBe("group:upgrade");
		expect(valueOf("check ›")).toBe("group:check");
		expect(valueOf("doctor ›")).toBe("group:doctor");
		expect(names()).not.toContain("doctor");
	});

	it("marks `probe` with the chevron, though it is a runnable command and not a group, and does not preview it", () => {
		expect(valueOf("probe ›")).toBe("probe");
		expect(COMMAND_REGISTRY.find((e) => e.name === "probe")?.supportsDryRun).toBeFalsy();
	});

	it("keeps plain `doctor` runnable, as the first item of its own submenu", () => {
		expect(names(["doctor"])).toEqual([
			"doctor (run it)",
			"doctor (everything)",
			"monitoring",
			"notifications",
			"environments",
			"credentials",
			"project",
			"github-app",
			"logs",
			"dns",
			"repo",
			"secrets",
			"tokens",
			"variables",
			"variable-owners",
			"ci",
		]);
		expect(valueOf("doctor (everything)", ["doctor"])).toBe("doctor all");
	});

	it("does not collapse a one-command group: `config show` is config › then show", () => {
		expect(names()).toContain("config ›");
		expect(names(["config"])).toEqual(["show"]);
		expect(names(["sync"])).toEqual([
			"sync (run it)",
			"secrets",
			"roles",
			"specs",
			"github",
			"issues",
			"ideas",
			"readme",
		]);
		expect(valueOf("ci", ["run"])).toBe("run ci");
	});

	it("nests as deep as the names go, and gives a runnable group a leading `(run it)` item", () => {
		expect(names(["setup"])).toEqual(["setup (run it)", "notifications", "project"]);
		expect(names(["cleanup"])).toEqual(["posts", "branches"]);
		expect(names(["upgrade"])).toEqual(["node", "deps"]);
		expect(menuItems(COMMAND_REGISTRY, ["sync"])[0]).toMatchObject({
			name: "sync (run it)",
			value: "sync",
		});
		expect(menuItems(COMMAND_REGISTRY, ["deploy"]).map((i) => i.value)).toEqual([
			"deploy",
			"deploy cleanup-preview",
			"deploy on-release",
		]);
	});

	it("run has no bare entry in the static registry — just `ci` until the dynamic task entries are merged in", () => {
		expect(menuItems(COMMAND_REGISTRY, ["run"]).map((i) => i.value)).toEqual(["run ci"]);
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
		expect(() => getEntry("does-not-exist")).toThrow(/no command registry entry/);
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

	it("resolves remove token's thunk choices from the stored providers (no fixed provider set)", async () => {
		listStoredProvidersMock.mockReturnValue(["cloudflare", "github"]);
		selectMock.mockResolvedValue("cloudflare");
		const values = await promptForPositionals(getEntry("remove token"), {});
		expect(values).toEqual(["cloudflare"]);
		expect(selectMock).toHaveBeenCalledWith(
			expect.objectContaining({ choices: [{ value: "cloudflare" }, { value: "github" }] })
		);
	});

	it("throws NonInteractiveError for remove token when there are no stored providers to choose from", async () => {
		listStoredProvidersMock.mockReturnValue([]);
		const err = await promptForPositionals(getEntry("remove token"), {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/nothing stored yet/);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("resolves a multi-positional entry in order (new plugin)", async () => {
		inputMock.mockResolvedValueOnce("my-slug").mockResolvedValueOnce("MyVendor");
		expect(await promptForPositionals(getEntry("new plugin"), {})).toEqual(["my-slug", "MyVendor"]);
	});

	it("uses `cliArg` in the non-TTY hint for publish bump-versions", async () => {
		setTTY(false);
		const err = await promptForPositionals(getEntry("publish bump-versions"), {}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/holocron publish bump-versions <new-version>/);
	});
});

// `PUBLISH_OTP_OPTION`'s `required` is computed once, at module load, from
// HOLOCRON_NPM_ENFORCE_2FA -- vi.resetModules() + a fresh dynamic import is needed
// to see each state; env.get() itself re-reads process.env on every call,
// but that one-time computation already baked a boolean into the object by
// the time any later read would happen (holocron#1052 follow-up).
describe("publish package's otp option — HOLOCRON_NPM_ENFORCE_2FA (holocron#1052 follow-up)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	function otpOption(registry: typeof COMMAND_REGISTRY) {
		const publish = registry.find((e) => e.name === "publish package")!;
		const steady = publish.modes!.find((m) => m.key === "steady")!;
		return steady.options!.find((o) => o.key === "otp")!;
	}

	it("is checkbox-optional by default, still askLast", async () => {
		vi.resetModules();
		const { COMMAND_REGISTRY: registry } = await import("./command-catalog.js");
		const otp = otpOption(registry);
		expect(otp.required).toBe(false);
		expect(otp.askLast).toBe(true);
	});

	it("becomes required (but still askLast) when HOLOCRON_NPM_ENFORCE_2FA is set — an operator whose own npm account always enforces 2FA skips checking the box every run", async () => {
		vi.stubEnv("HOLOCRON_NPM_ENFORCE_2FA", "1");
		vi.resetModules();
		const { COMMAND_REGISTRY: registry } = await import("./command-catalog.js");
		const otp = otpOption(registry);
		expect(otp.required).toBe(true);
		expect(otp.askLast).toBe(true);
	});
});
