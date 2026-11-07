import { stripVTControlCharacters } from "node:util";

import { NonInteractiveError } from "@theholocron/kyber/ui";
import { describe, expect, it, vi } from "vitest";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, ProviderAction, ProviderActions, ProviderRow } from "../../plugin/index.js";
import { runProvider } from "./provider.js";

const asked = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@inquirer/prompts", () => ({ confirm: asked }));

const strip = (s: string) => stripVTControlCharacters(s);

const row = (over: Partial<ProviderRow> = {}): ProviderRow => ({
	id: "a",
	title: "step a",
	status: "ok",
	detail: "done",
	problems: [],
	...over,
});

const setup = vi.fn<ProviderAction>(async () => [row()]);
const doctor = vi.fn<ProviderAction>(async () => [row(), row({ id: "b", title: "step b", status: "skip" })]);

function loaderOf(groups: Record<string, ProviderActions>) {
	return {
		load: async () => {},
		providerActions: () => new Map(Object.entries(groups)),
		loadedKeys: () => ["issues"],
		get: () => [{}],
		loadFailures: () => [],
	} as unknown as PluginLoader;
}

function run(over: Partial<Parameters<typeof runProvider>[0]> = {}, groups?: Record<string, ProviderActions>) {
	const lines: string[] = [];
	const promise = runProvider({
		loaded: { resolved: {} } as LoadedConfig,
		context: { repoRoot: "/tmp" },
		loader: loaderOf(groups ?? { demo: { setup, doctor } }),
		print: (l) => lines.push(strip(l)),
		interactive: false,
		...over,
	});
	return { promise, text: () => lines.join("\n") };
}

describe("runProvider — listing", () => {
	it("lists each provider with the actions it offers", async () => {
		const { promise, text } = run({}, { zed: { doctor }, demo: { setup, doctor } });
		expect((await promise).status).toBe("listed");
		expect(text()).toMatch(/demo {2}setup, doctor\n {2}zed {3}doctor/);
	});

	it("prints to the console when no print is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await run({ print: undefined }, {}).promise;
		expect(log).toHaveBeenCalledWith(expect.stringContaining("no configured provider offers"));
		log.mockRestore();
	});

	it("says so when no provider offers either", async () => {
		const { promise, text } = run({}, {});
		expect((await promise).status).toBe("listed");
		expect(text()).toContain("no configured provider offers");
	});

	it("lists one provider's actions when only the name is given", async () => {
		const { promise, text } = run({ provider: "demo" }, { demo: { doctor } });
		expect((await promise).status).toBe("listed");
		expect(text()).toMatch(/demo {2}doctor/);
	});

	it("fails for a provider that offers neither, naming the ones that do", async () => {
		const { promise, text } = run({ provider: "nope" });
		expect((await promise).status).toBe("fail");
		expect(text()).toContain("`nope`");
		expect(text()).toContain("try: demo");
	});

	it("fails for a provider when none offers anything", async () => {
		const { promise, text } = run({ provider: "nope" }, {});
		expect((await promise).status).toBe("fail");
		expect(text()).toContain("none does");
	});

	it("fails for an action the provider does not have, or does not know", async () => {
		const missing = run({ provider: "demo", action: "setup" }, { demo: { doctor } });
		expect((await missing.promise).status).toBe("fail");
		expect(missing.text()).toContain("`demo` has no `setup`");
		expect(missing.text()).toContain("try: doctor");
		const unknown = run({ provider: "demo", action: "explode" });
		expect((await unknown.promise).status).toBe("fail");
		expect(unknown.text()).toContain("has no `explode`");
	});
});

describe("runProvider — doctor", () => {
	it("prints the rows and the counts, and does not ask anything", async () => {
		const confirm = vi.fn();
		const { promise, text } = run({ provider: "demo", action: "doctor", confirm });
		expect((await promise).status).toBe("ok");
		expect(text()).toContain("step a");
		expect(text()).toContain("1 ok, 0 fail, 1 skipped");
		expect(confirm).not.toHaveBeenCalled();
	});

	it("fails when a row fails", async () => {
		doctor.mockResolvedValueOnce([row({ status: "fail", problems: ["it is off"] })]);
		const { promise, text } = run({ provider: "demo", action: "doctor" });
		expect((await promise).status).toBe("fail");
		expect(text()).toContain("it is off");
	});

	it("turns a thrown error into a failing row", async () => {
		doctor.mockRejectedValueOnce(new Error("boom"));
		const { promise, text } = run({ provider: "demo", action: "doctor" });
		const report = await promise;
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ id: "demo:doctor", status: "fail", detail: "boom" });
		expect(text()).toContain("boom");
	});

	it("scrubs the tokens it was given from what a provider prints", async () => {
		doctor.mockResolvedValueOnce([
			row({ title: "key not-a-real-token", detail: "sent not-a-real-token", problems: ["not-a-real-token"] }),
		]);
		const { promise, text } = run({
			provider: "demo",
			action: "doctor",
			context: { repoRoot: "/tmp", cliToken: "not-a-real-token", cliTokens: { demo: "another-fake-value" } },
		});
		await promise;
		expect(text()).not.toContain("not-a-real-token");
		expect(text()).toContain("«hidden»");
	});
});

describe("runProvider — setup", () => {
	it("refuses to change things without --yes and without a terminal", async () => {
		setup.mockClear();
		const err = await run({ provider: "demo", action: "setup" }).promise.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/pass --yes/);
		expect(setup).not.toHaveBeenCalled();
	});

	it("runs with --yes and hands the provider the dry-run flag as false", async () => {
		setup.mockClear();
		const { promise } = run({ provider: "demo", action: "setup", yes: true });
		expect((await promise).status).toBe("ok");
		expect(setup).toHaveBeenCalledWith({ dryRun: false });
	});

	it("runs on --dry-run without asking, and says so in the heading", async () => {
		setup.mockClear();
		const { promise, text } = run({
			provider: "demo",
			action: "setup",
			context: { repoRoot: "/tmp", dryRun: true },
		});
		expect((await promise).status).toBe("ok");
		expect(setup).toHaveBeenCalledWith({ dryRun: true });
		expect(text()).toContain("(dry-run)");
	});

	it("asks on a terminal and runs when the answer is yes", async () => {
		setup.mockClear();
		const confirm = vi.fn(async () => true);
		const { promise } = run({ provider: "demo", action: "setup", interactive: true, confirm });
		expect((await promise).status).toBe("ok");
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining("provider demo setup"));
		expect(setup).toHaveBeenCalled();
	});

	it("asks through the terminal prompt when no confirm is injected", async () => {
		setup.mockClear();
		const { promise } = run({ provider: "demo", action: "setup", interactive: true });
		expect((await promise).status).toBe("ok");
		expect(asked).toHaveBeenCalledWith({ message: expect.stringContaining("Continue?"), default: false });
	});

	it("changes nothing when the answer is no", async () => {
		setup.mockClear();
		const { promise, text } = run({
			provider: "demo",
			action: "setup",
			interactive: true,
			confirm: async () => false,
		});
		expect((await promise).status).toBe("cancelled");
		expect(setup).not.toHaveBeenCalled();
		expect(text()).toContain("nothing was changed");
	});

	it("reads whether it can ask from stdin when not told", async () => {
		setup.mockClear();
		const was = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		try {
			const err = await run({ provider: "demo", action: "setup", interactive: undefined }).promise.catch(
				(e: unknown) => e
			);
			expect(err).toBeInstanceOf(NonInteractiveError);
		} finally {
			Object.defineProperty(process.stdin, "isTTY", { value: was, configurable: true });
		}
	});
});
