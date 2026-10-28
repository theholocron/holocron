import { describe, expect, it } from "vitest";

import type { PluginProbes } from "../../plugin/index.js";
import { buildChildArgv } from "../child-argv/index.js";
import { menuItems } from "../menu-items/index.js";
import { buildProbeMenuEntries } from "./probe-menu-entries.js";

const read = { summary: "Looks.", writes: false, run: async () => {} };
const write = { summary: "Makes.", writes: true, run: async () => {} };
const groups = new Map<string, PluginProbes>([
	["sentry", { rules: read, "send-error": write, integrations: read }],
	["checkly", { deliver: write }],
]);

describe("buildProbeMenuEntries", () => {
	const entries = buildProbeMenuEntries(groups);

	it("makes one entry per probe, providers and probes in alphabetical order", () => {
		expect(entries.map((e) => e.name)).toEqual([
			"probe checkly deliver",
			"probe sentry integrations",
			"probe sentry rules",
			"probe sentry send-error",
		]);
	});

	it("marks a probe that changes things, and offers a dry-run preview only for those", () => {
		const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
		expect(byName["probe sentry send-error"]).toMatchObject({
			description: "Makes. (changes things)",
			supportsDryRun: true,
		});
		expect(byName["probe sentry rules"]).toMatchObject({ description: "Looks.", supportsDryRun: false });
	});

	it("spawns the real command for the probe", () => {
		const entry = entries.find((e) => e.name === "probe sentry rules")!;
		expect(buildChildArgv(entry, [], { options: [], answers: {} }, { cwd: "/tmp" }, false)).toEqual(
			expect.arrayContaining(["probe", "sentry", "rules"])
		);
	});

	it("shows the providers first, then each provider's probes, under `probe`", () => {
		expect(menuItems(entries, ["probe"]).map((i) => i.name)).toEqual(["checkly ›", "sentry ›"]);
		expect(menuItems(entries, ["probe", "sentry"]).map((i) => i.name)).toEqual([
			"integrations",
			"rules",
			"send-error",
		]);
	});

	it("is empty when nothing offers a probe", () => {
		expect(buildProbeMenuEntries(new Map())).toEqual([]);
	});
});
