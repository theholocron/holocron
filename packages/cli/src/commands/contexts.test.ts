import { describe, expect, it } from "vitest";

import { COMMAND_CONTEXTS, commandsInContext, contextForCommand } from "./contexts.js";

/**
 * The full command surface, mirrored from the spec's table. If a new
 * command lands without a context entry, add it here and to
 * `COMMAND_CONTEXTS` in the same change — this test is the reminder.
 */
const EVERY_COMMAND = [
	"version",
	"clone",
	"new",
	"upgrade node",
	"upgrade deps",
	"plugin create",
	"auth set",
	"auth unset",
	"auth list",
	"auth check",
	"bump-versions",
	"publish",
	"skills install",
	"skills remove",
	"skills update",
	"run",
	"ci",
	"config show",
	"sync-readme",
	"doctor",
	"setup",
	"secret set",
	"secrets sync",
	"deploy",
	"cleanup-preview",
	"sync",
	"sync-github",
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
		for (const cmd of ["sync", "setup", "doctor", "secrets sync", "deploy", "cleanup-preview", "secret set"]) {
			expect(contextForCommand(cmd)).toBe("workspace");
		}
	});

	it("keeps the plugin-free commands out of `workspace`", () => {
		for (const cmd of ["version", "clone", "new", "run", "ci", "config show", "auth set", "auth check"]) {
			expect(contextForCommand(cmd)).not.toBe("workspace");
		}
	});
});

describe("contextForCommand", () => {
	it("resolves an exact multi-token key", () => {
		expect(contextForCommand("upgrade node")).toBe("global");
		expect(contextForCommand("secrets sync")).toBe("workspace");
	});

	it("falls back to the leading verb for an unlisted sub-command", () => {
		expect(contextForCommand("skills whatever")).toBe(undefined);
		expect(contextForCommand("auth")).toBe(undefined);
	});

	it("returns undefined for an unknown command", () => {
		expect(contextForCommand("teleport")).toBeUndefined();
	});
});
