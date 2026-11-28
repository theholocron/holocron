import { describe, expect, it, vi } from "vitest";

import type { Issues, PluginLoader } from "../../../plugin/index.js";
import { issueTypesStep } from "./issue-types-step.js";

function loaderOf(issues: Partial<Issues> | undefined, failure?: string): PluginLoader {
	return {
		has: (key: string) => key === "issues" && issues !== undefined,
		get: () => issues,
		loadFailures: () => (failure ? [{ key: "issues", provider: "github", error: new Error(failure) }] : []),
	} as unknown as PluginLoader;
}

const provider = (create = vi.fn(async () => ({ id: 9, name: "x", enabled: true }))) => ({
	providerName: "github",
	listTypes: async () => [{ id: 1, name: "Bug", enabled: true }],
	createType: create,
	updateType: vi.fn(),
});

const declared = [{ name: "Bug" }, { name: "Epic" }];

describe("issueTypesStep", () => {
	it("makes no step when nothing is declared", async () => {
		expect(await issueTypesStep({ declared: undefined, loader: loaderOf(undefined), dryRun: false })).toEqual([]);
		expect(await issueTypesStep({ declared: [], loader: loaderOf(undefined), dryRun: false })).toEqual([]);
	});

	it("creates a missing Type with --yes and never updates", async () => {
		const create = vi.fn(async () => ({ id: 9, name: "Epic", enabled: true }));
		const p = provider(create);
		const steps = await issueTypesStep({ declared, loader: loaderOf(p as never), dryRun: false, yes: true });
		expect(create).toHaveBeenCalledTimes(1);
		expect(p.updateType).not.toHaveBeenCalled();
		expect(steps.map((s) => [s.capability, s.step, s.status, s.message])).toEqual([
			["issues", "issue type Bug", "ok", "exists"],
			["issues", "issue type Epic", "ok", "created"],
		]);
	});

	it("reports a dry run as dry-run rows and writes nothing", async () => {
		const create = vi.fn();
		const steps = await issueTypesStep({
			declared,
			loader: loaderOf(provider(create) as never),
			dryRun: true,
		});
		expect(create).not.toHaveBeenCalled();
		expect(steps.map((s) => s.status)).toEqual(["ok", "dry-run"]);
	});

	it("skips, never fails, with no issues provider, naming why it did not load", async () => {
		const steps = await issueTypesStep({ declared, loader: loaderOf(undefined, "no token"), dryRun: false });
		expect(steps).toEqual([
			expect.objectContaining({
				step: "issue types",
				status: "skip",
				message: expect.stringContaining("no token"),
			}),
		]);
	});

	it("skips with no terminal and no --yes, and uses an answer when asked", async () => {
		const noTerminal = await issueTypesStep({
			declared,
			loader: loaderOf(provider() as never),
			dryRun: false,
			interactive: false,
		});
		expect(noTerminal).toEqual([
			expect.objectContaining({ status: "skip", message: expect.stringContaining("--yes") }),
		]);

		const confirm = vi.fn(async () => true);
		const asked = await issueTypesStep({
			declared,
			loader: loaderOf(provider() as never),
			dryRun: false,
			interactive: true,
			confirm,
		});
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(asked.map((s) => s.status)).toEqual(["ok", "ok"]);
	});

	it("keeps a failing write as a failing row with its problems", async () => {
		const create = vi.fn(async () => {
			throw new Error("boom");
		});
		const steps = await issueTypesStep({
			declared,
			loader: loaderOf(provider(create as never) as never),
			dryRun: false,
			yes: true,
		});
		expect(steps[1]).toMatchObject({ status: "fail", message: expect.stringContaining("boom") });
	});
});
