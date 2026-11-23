import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const created: unknown[] = [];

vi.mock("../../../plugin/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../../plugin/index.js")>()),
	assertPluginsResolvable: () => undefined,
	PluginLoader: class {
		constructor(...args: unknown[]) {
			created.push(args);
		}
		async load() {}
		loadedKeys() {
			return ["issues"];
		}
		loadFailures() {
			return [];
		}
		has() {
			return true;
		}
		get() {
			return {
				providerName: "github",
				listTypes: async () => [{ id: 1, name: "Bug", enabled: true }],
				createType: async () => ({ id: 2, name: "Epic", enabled: true }),
			};
		}
	},
}));

import { runIssueTypesApply } from "./run-issue-types-apply.js";
import type { RunIssueTypesApplyInput } from "./run-issue-types-apply.type.js";

afterEach(() => void (created.length = 0));

describe("runIssueTypesApply defaults", () => {
	it("builds its own plugin loader and prints to the console when none is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const report = await runIssueTypesApply({
			loaded: {
				resolved: { providers: {}, name: "demo", issueTypes: [{ name: "Bug" }, { name: "Epic" }] },
				filepath: "/x",
			} as unknown as RunIssueTypesApplyInput["loaded"],
			context: { repoRoot: "/x" },
			yes: true,
		});
		const printed = log.mock.calls.map((c) => stripVTControlCharacters(String(c[0]))).join("\n");
		log.mockRestore();
		expect(created).toHaveLength(1);
		expect(report).toMatchObject({ status: "ok", created: ["Epic"] });
		expect(printed).toMatch(/Epic/);
	});
});
