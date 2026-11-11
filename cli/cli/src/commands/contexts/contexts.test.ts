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
	"new token",
	"remove token",
	"list tokens",
	"export tokens",
	"new github-app",
	"new tunnel",
	"list projects",
	"new project",
	"project close",
	"project setup",
	"repo properties apply",
	"migrate issue",
	"migrate issues",
	"migrate project",
	"dev",
	"dev serve",
	"check token",
	"package bump-versions",
	"package move-tag",
	"package publish",
	"skills install",
	"remove skill",
	"skills update",
	"list skills",
	"run lint commit-msg",
	"run",
	"run ci",
	"deploy on-release",
	"deploy stage",
	"config show",
	"sync readme",
	"doctor",
	"repo setup",
	"list secrets",
	"new secret",
	"sync secrets",
	"new channel",
	"notifications setup",
	"notifications link",
	"new server",
	"sync roles",
	"notifications dedupe",
	"sync specs",
	"doctor all",
	"doctor notifications",
	"doctor environments",
	"doctor credentials",
	"doctor project",
	"doctor github-app",
	"doctor logs",
	"project move",
	"doctor dns",
	"doctor repo",
	"doctor secrets",
	"doctor tokens",
	"doctor monitoring",
	"doctor variables",
	"doctor variable-owners",
	"doctor shared-values",
	"doctor ci",
	"probe",
	"provider",
	"project reconcile",
	"deploy",
	"deploy cleanup-preview",
	"check monitor",
	"resolve checks",
	"check resolved",
	"sync",
	"repo cleanup branches",
	"sync github",
	"sync issues",
	"sync ideas",
	"new spec",
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
			"sync",
			"repo setup",
			"doctor",
			"sync secrets",
			"deploy",
			"deploy cleanup-preview",
			"new secret",
			"check monitor",
			"resolve checks",
			"new channel",
			"notifications setup",
			"notifications link",
			"new server",
			"sync roles",
			"notifications dedupe",
			"sync specs",
			"list projects",
			"new project",
			"project close",
			"project setup",
			"doctor all",
			"doctor notifications",
			"doctor environments",
			"doctor credentials",
			"doctor project",
			"doctor github-app",
			"doctor logs",
			"project move",
			"doctor dns",
			"doctor repo",
			"doctor secrets",
			"doctor tokens",
			"doctor monitoring",
			"doctor variables",
			"doctor variable-owners",
			"doctor shared-values",
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
			"deploy stage",
			"config show",
			"doctor ci",
			"new token",
			"check token",
			"check resolved",
		]) {
			expect(contextForCommand(cmd)).not.toBe("workspace");
		}
	});
});

describe("contextForCommand", () => {
	it("resolves an exact multi-token key", () => {
		expect(contextForCommand("repo upgrade node")).toBe("global");
		expect(contextForCommand("sync secrets")).toBe("workspace");
	});

	it("keeps a more specific key over its parent (deploy vs deploy on-release, run vs run ci)", () => {
		expect(contextForCommand("deploy")).toBe("workspace");
		expect(contextForCommand("deploy on-release")).toBe("repo-aware");
		expect(contextForCommand("run")).toBe("repo-aware");
		expect(contextForCommand("run lint commit-msg")).toBe("global");
	});

	it("falls back to the longest known prefix for an unlisted sub-command or step", () => {
		expect(contextForCommand("sync labels")).toBe("workspace");
		expect(contextForCommand("sync readme extra")).toBe("repo-aware");
		expect(contextForCommand("run audit performance")).toBe("repo-aware");
	});

	it("returns undefined for a bare group or an unknown command", () => {
		expect(contextForCommand("skills whatever")).toBeUndefined();
		expect(contextForCommand("repo")).toBeUndefined();
		expect(contextForCommand("teleport")).toBeUndefined();
		expect(contextForCommand("")).toBeUndefined();
	});
});
