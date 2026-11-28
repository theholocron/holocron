import { describe, expect, it } from "vitest";

import { TASKS } from "../../../registry/index.js";
import { toolCommand } from "./tool-command.js";

describe("toolCommand", () => {
	it("writes a registry tool with its args", () => {
		expect(toolCommand(TASKS["format"]!)).toBe("prettier --write .");
		expect(toolCommand(TASKS["lint:unused"]!)).toBe("knip");
	});

	it("writes a tool with no args as the bare binary", () => {
		expect(toolCommand({ group: "Security", scope: "repo", local: { tool: "gitleaks" } })).toBe("gitleaks");
	});

	it("quotes an argument that holds a glob character", () => {
		expect(toolCommand(TASKS["lint:markdown"]!)).toBe('markdownlint-cli2 "**/*.md"');
	});

	it("writes the linters of a group that have a local binary, joined", () => {
		expect(toolCommand(TASKS["lint:editorconfig"]!)).toBe("editorconfig-checker");
		expect(toolCommand(TASKS["scan:secrets"]!)).toBe("gitleaks dir --no-banner --config .gitleaks.toml");
		expect(toolCommand(TASKS["lint:code"]!)).toBe("eslint . && actionlint");
	});

	it("is null for a group none of whose linters runs locally, and for a name the linters do not know", () => {
		expect(toolCommand(TASKS["lint:commits"]!)).toBeNull();
		expect(toolCommand({ group: "Source Quality", scope: "repo", local: null, linterGroup: ["nope"] })).toBeNull();
	});

	it("is null for a CI-only task, a subcommand and a detected tool", () => {
		expect(toolCommand(TASKS["scan:code"]!)).toBeNull();
		expect(toolCommand(TASKS["sync-repo"]!)).toBeNull();
		expect(toolCommand(TASKS["validate:specs"]!)).toBeNull();
		expect(toolCommand(TASKS["build"]!)).toBeNull();
	});
});
