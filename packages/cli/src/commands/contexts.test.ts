import { describe, expect, it } from "vitest";

import { COMMAND_CONTEXTS, commandsInContext, contextForCommand } from "./contexts.js";

/**
 * The full command surface, mirrored from the spec's table. If a new
 * command lands without a context entry, add it here and to
 * `COMMAND_CONTEXTS` in the same change — this test is the reminder.
 */
const EVERY_COMMAND = [
	"clone",
	"new repo",
	"new plugin",
	"repo upgrade node",
	"repo upgrade deps",
	"auth set",
	"auth unset",
	"auth list",
	"auth check",
	"package bump-versions",
	"package publish",
	"skills install",
	"skills remove",
	"skills update",
	"run lint commit-msg",
	"run",
	"run ci",
	"deploy on-release",
	"config show",
	"repo sync readme",
	"doctor",
	"repo setup",
	"secrets set",
	"secrets sync",
	"deploy",
	"deploy cleanup-preview",
	"repo sync",
	"sync github",
];

describe("COMMAND_CONTEXTS", () => {
	it("tags every context with a valid value", () => {
		for (const ctx of Object.values(COMMAND_CONTEXTS)) {
			expect(["global", "repo-aware", "workspace"]).toContain(ctx);
		}
	});

	it("has an entry for every command on the documented surface, and no extras", () => {
		expect(Object.keys(COMMAND_CONTEXTS).sort()).toEqual([...EVERY_COMMAND].sort());
	});

	it("partitions cleanly across the three contexts", () => {
		const all = [
			...commandsInContext("global"),
			...commandsInContext("repo-aware"),
			...commandsInContext("workspace"),
		];
		expect(new Set(all).size).toBe(all.length);
		expect(all.length).toBe(Object.keys(COMMAND_CONTEXTS).length);
	});

	it("keeps the plugin-dependent commands in `workspace`", () => {
		for (const cmd of [
			"repo sync",
			"repo setup",
			"doctor",
			"secrets sync",
			"deploy",
			"deploy cleanup-preview",
			"secrets set",
		]) {
			expect(contextForCommand(cmd)).toBe("workspace");
		}
	});

	it("keeps the plugin-free commands out of `workspace`", () => {
		for (const cmd of [
			"clone",
			"new repo",
			"run",
			"run ci",
			"deploy on-release",
			"config show",
			"auth set",
			"auth check",
		]) {
			expect(contextForCommand(cmd)).not.toBe("workspace");
		}
	});
});

describe("contextForCommand", () => {
	it("resolves an exact multi-token key", () => {
		expect(contextForCommand("repo upgrade node")).toBe("global");
		expect(contextForCommand("secrets sync")).toBe("workspace");
	});

	it("keeps a more specific key over its parent (deploy vs deploy on-release, run vs run ci)", () => {
		expect(contextForCommand("deploy")).toBe("workspace");
		expect(contextForCommand("deploy on-release")).toBe("repo-aware");
		expect(contextForCommand("run")).toBe("repo-aware");
		expect(contextForCommand("run lint commit-msg")).toBe("global");
	});

	it("falls back to the longest known prefix for an unlisted sub-command or step", () => {
		expect(contextForCommand("repo sync labels")).toBe("workspace");
		expect(contextForCommand("repo sync readme extra")).toBe("repo-aware");
		expect(contextForCommand("run audit performance")).toBe("repo-aware");
	});

	it("returns undefined for a bare group or an unknown command", () => {
		expect(contextForCommand("skills whatever")).toBeUndefined();
		expect(contextForCommand("repo")).toBeUndefined();
		expect(contextForCommand("teleport")).toBeUndefined();
		expect(contextForCommand("")).toBeUndefined();
	});
});
