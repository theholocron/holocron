import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { PluginLoader, Source } from "../../../plugin/index.js";
import { capabilityValues } from "../capability-property/index.js";
import { runPropertiesApply } from "./run-properties-apply.js";
import type { RunPropertiesApplyInput } from "./run-properties-apply.type.js";

const loaded = {
	resolved: { providers: {}, name: "demo" },
	filepath: "/x",
} as unknown as RunPropertiesApplyInput["loaded"];
const LACKING = capabilityValues().filter((v) => v !== "projects" && v !== "tunnels");

const loaderOf = (source: Partial<Source> | undefined, failure?: string) =>
	({
		load: async () => {},
		loadedKeys: () => (source ? ["source"] : []),
		loadFailures: () => (failure ? [{ key: "source", provider: "github", error: new Error(failure) }] : []),
		has: () => source !== undefined,
		get: () => ({ providerName: "github", ...source }),
	}) as unknown as PluginLoader;

async function run(
	source: Partial<Source> | undefined,
	extra: Partial<RunPropertiesApplyInput> = {},
	failure?: string
) {
	const lines: string[] = [];
	const report = await runPropertiesApply({
		loaded,
		context: { repoRoot: "/x" },
		loader: loaderOf(source, failure),
		yes: true,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...extra,
	});
	return { report, lines: lines.join("\n") };
}

describe("runPropertiesApply", () => {
	it("adds the capabilities the property lacks and says which", async () => {
		const addOrgPropertyValues = vi.fn(async (_n: string, values: string[]) => values);
		const { report, lines } = await run({ getOrgPropertyValues: async () => LACKING, addOrgPropertyValues });
		expect(addOrgPropertyValues).toHaveBeenCalledWith("holocron_capabilities", ["projects", "tunnels"]);
		expect(report).toEqual({ status: "ok", added: ["projects", "tunnels"] });
		expect(lines).toContain("holocron_capabilities: added projects, tunnels");
	});

	it("does nothing when every capability is already allowed", async () => {
		const addOrgPropertyValues = vi.fn();
		const { report, lines } = await run({
			getOrgPropertyValues: async () => [...capabilityValues(), "extra"],
			addOrgPropertyValues,
		});
		expect(report).toEqual({ status: "ok", added: [] });
		expect(addOrgPropertyValues).not.toHaveBeenCalled();
		expect(lines).toContain("already allows every capability");
	});

	it("on a dry run says what it would add and writes and asks nothing", async () => {
		const addOrgPropertyValues = vi.fn();
		const { report, lines } = await run(
			{ getOrgPropertyValues: async () => LACKING, addOrgPropertyValues },
			{ context: { repoRoot: "/x", dryRun: true }, yes: false }
		);
		expect(report).toEqual({ status: "ok", added: ["projects", "tunnels"] });
		expect(lines).toContain("dry run: would add projects, tunnels");
		expect(addOrgPropertyValues).not.toHaveBeenCalled();
		expect(inquirerConfirm).not.toHaveBeenCalled();
	});

	it("asks first, and a no changes nothing", async () => {
		const addOrgPropertyValues = vi.fn(async (_n: string, v: string[]) => v);
		const ask = vi.fn(async () => false);
		const source = { getOrgPropertyValues: async () => LACKING, addOrgPropertyValues };
		const no = await run(source, { yes: false, interactive: true, confirm: ask });
		expect(ask).toHaveBeenCalledWith(
			"Allow projects, tunnels in holocron_capabilities for the whole organization?"
		);
		expect(no.report.status).toBe("cancelled");
		expect(addOrgPropertyValues).not.toHaveBeenCalled();
		const yes = await run(source, { yes: false, interactive: true, confirm: async () => true });
		expect(yes.report.status).toBe("ok");
	});

	it("uses the inquirer prompt by default, and refuses without a terminal", async () => {
		const source = { getOrgPropertyValues: async () => LACKING, addOrgPropertyValues: vi.fn() };
		inquirerConfirm.mockResolvedValueOnce(false);
		expect((await run(source, { yes: false, interactive: true })).report.status).toBe("cancelled");
		await expect(run(source, { yes: false, interactive: false })).rejects.toBeInstanceOf(NonInteractiveError);
	});

	it("fails when the definition cannot be read, and when reading or writing throws", async () => {
		const unreadable = await run({ getOrgPropertyValues: async () => undefined, addOrgPropertyValues: vi.fn() });
		expect(unreadable.report).toMatchObject({ status: "fail", reason: expect.stringContaining("cannot read") });
		const readBoom = await run({
			getOrgPropertyValues: async () => Promise.reject(new Error("rate limited")),
			addOrgPropertyValues: vi.fn(),
		});
		expect(readBoom.report).toMatchObject({ status: "fail", reason: expect.stringContaining("rate limited") });
		const writeBoom = await run({
			getOrgPropertyValues: async () => LACKING,
			addOrgPropertyValues: async () => Promise.reject(new Error("403 needs Custom properties: admin")),
		});
		expect(writeBoom.report).toMatchObject({
			status: "fail",
			reason: expect.stringContaining("Custom properties: admin"),
		});
	});

	it("skips when there is no source or the provider cannot change the property", async () => {
		expect((await run(undefined)).report.status).toBe("skip");
		expect((await run(undefined, {}, "no token")).report.reason).toContain("no token");
		const cannot = await run({ getOrgPropertyValues: async () => LACKING });
		expect(cannot.report).toMatchObject({
			status: "skip",
			reason: expect.stringContaining("cannot read or change"),
		});
	});
});
