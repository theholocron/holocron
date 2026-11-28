import { afterEach, describe, expect, it, vi } from "vitest";

const loaderOf = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("../../../plugin/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../../plugin/index.js")>()),
	PluginLoader: class {
		constructor() {
			return loaderOf.current as object;
		}
	},
}));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import { capabilityValues } from "../capability-property/index.js";
import { runPropertiesApply } from "./run-properties-apply.js";

const loaded = { resolved: { providers: {}, name: "demo" }, filepath: "/x" } as never;
const lacking = capabilityValues().filter((v) => v !== "projects");

const withSource = () => {
	loaderOf.current = {
		load: async () => {},
		loadedKeys: () => ["source"],
		loadFailures: () => [],
		has: () => true,
		get: () => ({
			providerName: "github",
			getOrgPropertyValues: async () => lacking,
			addOrgPropertyValues: async (_n: string, v: string[]) => v,
		}),
	};
};

afterEach(() => vi.restoreAllMocks());

describe("runPropertiesApply defaults", () => {
	it("builds its own loader and prints to the console when given neither", async () => {
		withSource();
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runPropertiesApply({ loaded, context: { repoRoot: "/x" }, yes: true });
		expect(report).toEqual({ status: "ok", added: ["projects"] });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("added projects"));
	});

	it("works out whether it can ask from the terminal when told nothing, and refuses when there is none", async () => {
		withSource();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const tty = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		await expect(runPropertiesApply({ loaded, context: { repoRoot: "/x" } })).rejects.toBeInstanceOf(
			NonInteractiveError
		);
		Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
	});
});
