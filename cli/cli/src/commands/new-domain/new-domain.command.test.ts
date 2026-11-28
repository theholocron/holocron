import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runNewDomain = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const prompts = vi.hoisted(() => ({ confirm: vi.fn(), input: vi.fn(), select: vi.fn() }));
vi.mock("@inquirer/prompts", () => prompts);
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./new-domain.js", () => ({ runNewDomain }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));
vi.mock("../../plugin/index.js", () => ({ PluginLoader: class {} }));

import { newDomainCommand } from "./new-domain.command.js";

const run = (argv: Record<string, unknown> = {}) =>
	(newDomainCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...argv } as never);
const isTTY = process.stdin.isTTY;

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runNewDomain.mockResolvedValue({ status: "ok" });
	process.stdin.isTTY = false;
});
afterEach(() => {
	process.exitCode = undefined;
	process.stdin.isTTY = isTTY;
});

describe("new domain command", () => {
	it("hands the flags to the run, and nobody to ask without a terminal", async () => {
		await run({
			type: "CNAME",
			name: "a.example.dev",
			value: "t.example.net",
			note: "n",
			proxied: true,
			yes: true,
		});
		const input = runNewDomain.mock.calls[0]![0];
		expect(input).toMatchObject({
			type: "CNAME",
			name: "a.example.dev",
			value: "t.example.net",
			note: "n",
			proxied: true,
			yes: true,
		});
		expect(input.context).toMatchObject({ repoRoot: "/repo", org: "acme" });
		expect(input.ask).toBeUndefined();
		expect(input.confirm).toBeUndefined();
		expect(process.exitCode).toBeUndefined();
	});

	it("leaves out the flags it was not given", async () => {
		await run();
		const input = runNewDomain.mock.calls[0]![0];
		for (const key of ["type", "name", "value", "note", "proxied", "yes"]) expect(input).not.toHaveProperty(key);
	});

	it("can ask on a terminal: a type from a list, a name and a value as text, and a yes or no", async () => {
		process.stdin.isTTY = true;
		prompts.select.mockResolvedValue("TXT");
		prompts.input.mockResolvedValue("typed");
		prompts.confirm.mockResolvedValue(true);
		await run();
		const { ask, confirm } = runNewDomain.mock.calls[0]![0];
		expect(await ask("type")).toBe("TXT");
		expect(await ask("name")).toBe("typed");
		expect(await ask("value")).toBe("typed");
		expect(prompts.input.mock.calls.map((c) => c[0].message)).toEqual([
			"Hostname:",
			"Value, as the vendor shows it:",
		]);
		expect(await confirm("Make it?")).toBe(true);
		expect(prompts.confirm).toHaveBeenCalledWith({ message: "Make it?", default: false });
	});

	it("prints through the console", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		await run();
		runNewDomain.mock.calls[0]![0].print("hello");
		expect(log).toHaveBeenCalledWith("hello");
		log.mockRestore();
	});

	it("declares its options", () => {
		const names: string[] = [];
		const yargs = { option: (name: string) => (names.push(name), yargs) };
		(newDomainCommand.builder as (y: unknown) => unknown)(yargs);
		expect(names).toEqual(["type", "name", "value", "note", "proxied", "yes"]);
	});

	it("exits 1 on a failure", async () => {
		runNewDomain.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runNewDomain).not.toHaveBeenCalled();
	});
});
