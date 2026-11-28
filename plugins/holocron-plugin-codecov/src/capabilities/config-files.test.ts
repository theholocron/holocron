import { describe, expect, it } from "vitest";

import { createCodecovConfig, mergeCodecovComponents } from "../config-file/codecov-config.js";
import { CODECOV_CONFIG_FILE, configFiles } from "./config-files.js";

const components = [
	{ id: "cli", path: "cli/cli" },
	{ id: "web", path: "apps/web" },
];
const flags = ["cli", "web"];

describe("configFiles", () => {
	it("scaffolds codecov.yml when the repo has none", () => {
		const files = configFiles({ components, flags, documentation: "off", existing: () => null });
		expect(Object.keys(files)).toEqual([CODECOV_CONFIG_FILE]);
		expect(files["codecov.yml"]).toBe(createCodecovConfig(components, { flags, documentation: "off" }));
	});

	it("merges into the codecov.yml that is there, asking for it by its path", () => {
		const asked: string[] = [];
		const existing = "comment: false\n";
		const files = configFiles({
			components,
			flags,
			documentation: "required",
			existing: (path) => {
				asked.push(path);
				return existing;
			},
		});
		expect(asked).toEqual(["codecov.yml"]);
		expect(files["codecov.yml"]).toBe(
			mergeCodecovComponents(existing, components, { flags, documentation: "required" })
		);
		expect(files["codecov.yml"]).toContain("comment: false");
	});
});
